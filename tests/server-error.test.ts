import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isWriteConflict, serverErrorDetails } from '../src/lib/server-error'

test('deadlocks and serialization failures are retryable write conflicts', () => {
  assert.equal(isWriteConflict({ code: 'P2034' }), true)
  assert.equal(isWriteConflict({ code: 'P2010', meta: { driverAdapterError: { name: 'DriverAdapterError', cause: { originalCode: '40P01', originalMessage: 'deadlock detected', kind: 'TransactionWriteConflict' } } } }), true)
  assert.equal(isWriteConflict({ code: 'P2010', meta: { driverAdapterError: { cause: { originalCode: '40001' } } } }), true)
  assert.equal(isWriteConflict({ code: 'P2010', meta: { driverAdapterError: { cause: { originalCode: '23505', kind: 'UniqueConstraintViolation' } } } }), false)
  assert.equal(isWriteConflict(new TypeError('boom')), false)
  assert.equal(isWriteConflict(null), false)
})

test('database diagnostics preserve codes and schema identifiers without query or data values', () => {
  const diagnostic = serverErrorDetails({ name: 'PrismaClientKnownRequestError', code: 'P2022', message: 'postgresql://private:secret@host/database', meta: { modelName: 'ChangeSet', column: 'ChangeSet.executionMode', query: 'secret record', args: ['private'] } })
  assert.deepEqual(diagnostic, { name: 'PrismaClientKnownRequestError', code: 'P2022', model: 'ChangeSet', table: undefined, column: 'ChangeSet.executionMode' })
  assert.equal(JSON.stringify(diagnostic).includes('secret'), false)
})
test('unstructured failures and unsafe metadata are omitted', () => {
  const diagnostic = serverErrorDetails({ name: 'secret name', code: 'postgresql://secret', meta: { modelName: 'some record value', column: 'password=value', table: 'https://private' } })
  assert.deepEqual(diagnostic, { name: 'ServerError', code: undefined, model: undefined, column: undefined, table: undefined })
  assert.equal(serverErrorDetails(null).name, 'ServerError')
})
