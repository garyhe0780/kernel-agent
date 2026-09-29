import { z } from 'zod'
import type { Prisma, PrismaClient } from '@prisma/client'
import type { Principal } from './definition'
import { KernelError } from './errors'
import {
  accessInclude,
  effectiveRole,
  hasOwnerAccess,
  memberProjectIds,
} from './member-access.server'

const scope = { project: z.string().min(1).max(80).optional() }
const groupVersion = {
  id: z.string().min(1),
  expectedVersion: z.number().int().positive(),
}
export const accessCommands = [
  z
    .object({
      type: z.literal('create_access_group'),
      ...scope,
      name: z.string().trim().min(1).max(80),
      description: z.string().trim().max(500),
    })
    .strict(),
  z
    .object({
      type: z.literal('update_access_group'),
      ...scope,
      ...groupVersion,
      name: z.string().trim().min(1).max(80),
      description: z.string().trim().max(500),
    })
    .strict(),
  z
    .object({
      type: z.literal('delete_access_group'),
      ...scope,
      ...groupVersion,
    })
    .strict(),
  z
    .object({
      type: z.literal('set_access_group_members'),
      ...scope,
      ...groupVersion,
      userIds: z.array(z.string().min(1)).max(500),
    })
    .strict(),
  z
    .object({
      type: z.literal('create_access_policy'),
      ...scope,
      ...groupVersion,
      target: z.string().min(1).optional(),
      role: z.enum(['owner', 'operator']),
    })
    .strict(),
  z
    .object({
      type: z.literal('delete_access_policy'),
      ...scope,
      ...groupVersion,
      policyId: z.string().min(1),
    })
    .strict(),
  z
    .object({
      type: z.literal('remove_application_member'),
      project: z.string().min(1),
      userId: z.string().min(1),
    })
    .strict(),
  z
    .object({
      type: z.literal('revoke_application_invitation'),
      project: z.string().min(1),
      id: z.string().min(1),
    })
    .strict(),
] as const
const commandSchema = z.discriminatedUnion('type', accessCommands)
type Tx = Prisma.TransactionClient

export class AccessManagement {
  constructor(private db: PrismaClient) {}
  private async scope(tx: Tx, p: Principal, slug?: string) {
    if (
      p.kind !== 'human' ||
      p.agentCredentialId ||
      p.role !== 'owner' ||
      !(await hasOwnerAccess(tx, p.workspaceId, p.userId))
    )
      throw new KernelError(
        'FORBIDDEN',
        'Only workspace owners can manage members and groups.',
        403
      )
    if (!slug) return null
    const project = await tx.project.findUnique({
      where: { workspaceId_slug: { workspaceId: p.workspaceId, slug } },
    })
    if (!project)
      throw new KernelError('NOT_FOUND', 'Application not found.', 404)
    return project
  }
  async list(p: Principal, slug?: string) {
    return this.db.$transaction(async (tx) => {
      const project = await this.scope(tx, p, slug)
      const rows = await tx.membership.findMany({
        where: { workspaceId: p.workspaceId },
        include: {
          ...accessInclude,
          user: { select: { id: true, name: true, email: true } },
        },
        orderBy: { user: { name: 'asc' } },
      })
      const members = await Promise.all(
        rows.map(async (row) => {
          const role = effectiveRole(row)
          const direct = project
            ? await tx.projectMember.findUnique({
                where: {
                  projectId_userId: {
                    projectId: project.id,
                    userId: row.userId,
                  },
                },
              })
            : null
          const included =
            !project ||
            role !== 'application' ||
            (await memberProjectIds(tx, p.workspaceId, row.userId)).has(
              project.id
            )
          return {
            user: row.user,
            role,
            directRole: row.role,
            included,
            direct: Boolean(direct),
            groups: row.groups.map((link) => ({
              id: link.group.id,
              name: link.group.name,
              projectId: link.group.projectId,
            })),
          }
        })
      )
      const groups = await tx.accessGroup.findMany({
        where: { workspaceId: p.workspaceId, projectId: project?.id ?? null },
        include: {
          members: { include: { membership: { select: { userId: true } } } },
          policies: {
            include: { project: { select: { slug: true, name: true } } },
          },
        },
        orderBy: { name: 'asc' },
      })
      const invitations = project
        ? await tx.projectInvitation.findMany({
            where: { projectId: project.id, expiresAt: { gt: new Date() } },
            select: { id: true, email: true, expiresAt: true },
          })
        : await tx.workspaceInvitation.findMany({
            where: {
              workspaceId: p.workspaceId,
              expiresAt: { gt: new Date() },
            },
            select: { id: true, email: true, role: true, expiresAt: true },
          })
      const projects = await tx.project.findMany({
        where: { workspaceId: p.workspaceId },
        select: { id: true, slug: true, name: true },
        orderBy: { name: 'asc' },
      })
      return {
        members: members.filter((member) => member.included),
        availableMembers: members,
        groups: groups.map((group) => ({
          ...group,
          userIds: group.members.map((member) => member.membership.userId),
          members: undefined,
        })),
        invitations,
        projects,
        projectId: project?.id ?? null,
      }
    })
  }
  async mutate(p: Principal, raw: unknown) {
    const command = commandSchema.parse(raw)
    return this.db.$transaction(async (tx) => {
      // Serialize membership and policy edits in this workspace before rechecking authorization.
      await tx.$queryRaw`SELECT "id" FROM "Workspace" WHERE "id" = ${p.workspaceId} FOR UPDATE`
      const project = await this.scope(tx, p, command.project)
      let result: { id?: string } = {}
      if (command.type === 'create_access_group') {
        if (
          await tx.accessGroup.findFirst({
            where: {
              workspaceId: p.workspaceId,
              projectId: project?.id ?? null,
              name: { equals: command.name, mode: 'insensitive' },
            },
          })
        )
          throw new KernelError(
            'CONFLICT',
            'A group with this name already exists.',
            409
          )
        result = await tx.accessGroup.create({
          data: {
            workspaceId: p.workspaceId,
            projectId: project?.id,
            name: command.name,
            description: command.description,
          },
        })
      } else if (command.type === 'revoke_application_invitation') {
        const removed = await tx.projectInvitation.deleteMany({
          where: { id: command.id, projectId: project!.id },
        })
        if (!removed.count)
          throw new KernelError(
            'NOT_FOUND',
            'Invitation no longer exists.',
            404
          )
      } else if (command.type === 'remove_application_member') {
        const member = await tx.membership.findUnique({
          where: {
            userId_workspaceId: {
              userId: command.userId,
              workspaceId: p.workspaceId,
            },
          },
          include: accessInclude,
        })
        if (
          !member ||
          effectiveRole(member) !== 'application' ||
          member.groups.some((link) =>
            link.group.policies.some(
              (policy) => policy.projectId === project!.id
            )
          )
        )
          throw new KernelError(
            'CONFLICT',
            'This access is inherited. Update the workspace role or group policy instead.',
            409
          )
        const removed = await tx.projectMember.deleteMany({
          where: { projectId: project!.id, userId: command.userId },
        })
        if (!removed.count)
          throw new KernelError(
            'NOT_FOUND',
            'Application membership no longer exists.',
            404
          )
      } else {
        const group = await tx.accessGroup.findFirst({
          where: {
            id: command.id,
            workspaceId: p.workspaceId,
            projectId: project?.id ?? null,
          },
        })
        if (!group)
          throw new KernelError(
            'NOT_FOUND',
            'Group not found in this account.',
            404
          )
        const updated = await tx.accessGroup.updateMany({
          where: { id: group.id, version: command.expectedVersion },
          data: { version: { increment: 1 } },
        })
        if (!updated.count)
          throw new KernelError(
            'CONFLICT',
            'This group changed. Refresh before trying again.',
            409
          )
        if (command.type === 'update_access_group') {
          if (
            await tx.accessGroup.findFirst({
              where: {
                id: { not: group.id },
                workspaceId: p.workspaceId,
                projectId: group.projectId,
                name: { equals: command.name, mode: 'insensitive' },
              },
            })
          )
            throw new KernelError(
              'CONFLICT',
              'A group with this name already exists.',
              409
            )
          await tx.accessGroup.update({
            where: { id: group.id },
            data: { name: command.name, description: command.description },
          })
        } else if (command.type === 'delete_access_group') {
          await tx.accessGroup.delete({ where: { id: group.id } })
        } else if (command.type === 'set_access_group_members') {
          const userIds = [...new Set(command.userIds)]
          const members = await tx.membership.findMany({
            where: { workspaceId: p.workspaceId, userId: { in: userIds } },
          })
          if (members.length !== userIds.length)
            throw new KernelError(
              'INVALID_INPUT',
              'Choose existing members of this workspace.',
              422
            )
          await tx.accessGroupMember.deleteMany({
            where: { groupId: group.id },
          })
          await tx.accessGroupMember.createMany({
            data: members.map((member) => ({
              groupId: group.id,
              membershipId: member.id,
            })),
          })
        } else if (command.type === 'create_access_policy') {
          const target = command.target
            ? await tx.project.findUnique({
                where: {
                  workspaceId_slug: {
                    workspaceId: p.workspaceId,
                    slug: command.target,
                  },
                },
              })
            : null
          if (command.target && !target)
            throw new KernelError(
              'NOT_FOUND',
              'Application not found in this workspace.',
              404
            )
          if (project && target?.id !== project.id)
            throw new KernelError(
              'FORBIDDEN',
              'Application groups can only grant access to their own application.',
              403
            )
          if (target && command.role !== 'operator')
            throw new KernelError(
              'INVALID_INPUT',
              'Application policies support the Operator role. Owner is a workspace role.',
              422
            )
          if (
            await tx.accessPolicy.findFirst({
              where: {
                groupId: group.id,
                projectId: target?.id ?? null,
                role: command.role,
              },
            })
          )
            throw new KernelError(
              'CONFLICT',
              'This permission policy already exists.',
              409
            )
          await tx.accessPolicy.create({
            data: {
              groupId: group.id,
              projectId: target?.id,
              role: command.role,
            },
          })
        } else if (command.type === 'delete_access_policy') {
          const removed = await tx.accessPolicy.deleteMany({
            where: { id: command.policyId, groupId: group.id },
          })
          if (!removed.count)
            throw new KernelError(
              'NOT_FOUND',
              'Permission policy no longer exists.',
              404
            )
        }
        result = { id: group.id }
      }
      // Keep an owner able to administer access, including after editing their own group.
      if (!(await hasOwnerAccess(tx, p.workspaceId, p.userId)))
        throw new KernelError(
          'SELF_CHANGE',
          'Ask another owner to change the group that grants your owner access.',
          409
        )
      await tx.execution.create({
        data: {
          workspaceId: p.workspaceId,
          actorId: p.userId,
          actorName: p.name,
          actorKind: p.kind,
          action: command.type,
          outcome: 'applied',
          details: { ...command, groupId: result.id ?? null },
        },
      })
      return result
    })
  }
}
