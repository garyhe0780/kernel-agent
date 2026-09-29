import type { Prisma } from '@prisma/client'

type Tx = Prisma.TransactionClient
export const accessInclude = {
  groups: { include: { group: { include: { policies: true } } } },
} as const

type MemberAccess = {
  role: string
  groups: {
    group: { policies: { projectId: string | null; role: string }[] }
  }[]
}
export function effectiveRole(member: MemberAccess) {
  const roles = [
    member.role,
    ...member.groups.flatMap((link) =>
      link.group.policies
        .filter((policy) => !policy.projectId)
        .map((policy) => policy.role)
    ),
  ]
  return roles.includes('owner')
    ? 'owner'
    : roles.includes('operator')
      ? 'operator'
      : member.role
}
export async function effectiveMember(
  tx: Tx,
  workspaceId: string,
  userId: string
) {
  const member = await tx.membership.findUnique({
    where: { userId_workspaceId: { workspaceId, userId } },
    include: accessInclude,
  })
  return member
    ? { ...member, directRole: member.role, role: effectiveRole(member) }
    : null
}
export async function hasOwnerAccess(
  tx: Tx,
  workspaceId: string,
  userId: string
) {
  return (await effectiveMember(tx, workspaceId, userId))?.role === 'owner'
}
export async function memberProjectIds(
  tx: Tx,
  workspaceId: string,
  userId: string
) {
  const member = await effectiveMember(tx, workspaceId, userId)
  if (!member) return new Set<string>()
  const direct = await tx.projectMember.findMany({
    where: { userId, project: { workspaceId } },
    select: { projectId: true },
  })
  return new Set([
    ...direct.map((row) => row.projectId),
    ...member.groups.flatMap((link) =>
      link.group.policies.flatMap((policy) =>
        policy.projectId ? [policy.projectId] : []
      )
    ),
  ])
}
