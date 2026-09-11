import 'dotenv/config'
import { PrismaClient } from '@prisma/client'

const globalDb = globalThis as unknown as { kernelDb?: PrismaClient }
export const db = globalDb.kernelDb ?? new PrismaClient()
if (process.env.NODE_ENV !== 'production') globalDb.kernelDb = db
