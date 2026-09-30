import { useCallback, useContext, useEffect, useId, useRef, useState } from 'react'
import { FrameBreadcrumbContext } from './frame-breadcrumb'
import { ChevronRight, Plus, Search, RefreshCw, Copy, Check } from 'lucide-react'
import { request, date } from '@/lib/client'
import { Button } from './ui/button'
import { Tabs } from './ui/tabs'
import { Alert, Badge, Empty } from './ui/surfaces'
import { Dialog } from './ui/dialog'
import { Field, FieldLabel } from './ui/form-field'
import { Input } from './ui/input'

type Member = {
  user: { id: string; name: string; email: string }
  role: string
  directRole: string
  direct: boolean
  groups: { id: string; name: string; projectId: string | null }[]
}
type Policy = {
  id: string
  role: string
  projectId: string | null
  project: { slug: string; name: string } | null
}
type Group = {
  id: string
  name: string
  description: string
  version: number
  userIds: string[]
  policies: Policy[]
}
type Access = {
  members: Member[]
  availableMembers: Member[]
  groups: Group[]
  projectId: string | null
  projects: { id: string; slug: string; name: string }[]
  invitations: { id: string; email: string; role?: string; expiresAt: string }[]
}
const roleName = (role: string) =>
  role === 'owner'
    ? 'Owner'
    : role === 'operator'
      ? 'Operator'
      : 'Application member'

export function AccountMembers({
  project,
  accountName,
  userId,
  embedded = false,
}: {
  project?: string
  accountName: string
  userId: string
  embedded?: boolean
}) {
  const Heading = embedded ? 'h2' : 'h1'
  const setFrameBreadcrumb = useContext(FrameBreadcrumbContext)
  const [data, setData] = useState<Access>()
  const [tab, setTab] = useState('members')
  const [groupId, setGroupId] = useState<string>()
  const [groupTab, setGroupTab] = useState('members')
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [revision, setRevision] = useState(0)
  const [form, setForm] = useState<'invite' | 'group' | 'policy' | 'members'>()
  const [email, setEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('operator')
  const [inviteLink, setInviteLink] = useState('')
  const [inviteCopied, setInviteCopied] = useState(false)
  const inviteEmailId = useId()
  const inviteCopyButton = useRef<HTMLButtonElement>(null)
  useEffect(() => { if (inviteLink) inviteCopyButton.current?.focus({ preventScroll: true }) }, [inviteLink])
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [selectedUsers, setSelectedUsers] = useState<string[]>([])
  const [scope, setScope] = useState(project ? 'application' : '')
  const [target, setTarget] = useState(project ?? '')
  const [role, setRole] = useState('')
  const [confirmation, setConfirmation] = useState<{
    title: string
    description: string
    command: object
  }>()
  const group = data?.groups.find((item) => item.id === groupId)
  useEffect(() => {
    let active = true
    setBusy(true)
    request<Access>(`/api/kernel?members=${encodeURIComponent(project ?? '')}`)
      .then((value) => {
        if (active) {
          setData(value)
          setError('')
        }
      })
      .catch((e) => {
        if (active) setError(e.message)
      })
      .finally(() => {
        if (active) setBusy(false)
      })
    return () => {
      active = false
    }
  }, [project, revision])
  async function mutate(command: object, message: string) {
    if (busy) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const result = await request<{ id?: string }>('/api/kernel', {
        ...command,
        ...(project ? { project } : {}),
      })
      setForm(undefined)
      setNotice(message)
      setRevision((value) => value + 1)
      return result
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to save changes.')
      setBusy(false)
    }
  }
  function openGroup(item: Group) {
    setGroupId(item.id)
    setGroupTab('members')
    setQuery('')
    setForm(undefined)
    setName(item.name)
    setDescription(item.description)
    setNotice('')
    setError('')
  }
  const back = useCallback((toMembers = false) => {
    setGroupId(undefined)
    setTab(toMembers ? 'members' : 'groups')
    setForm(undefined)
    setQuery('')
    setNotice('')
  }, [])
  useEffect(() => {
    if (!setFrameBreadcrumb) return
    setFrameBreadcrumb(group ? [
      { label: 'Members', onPress: () => back(true) },
      { label: 'Groups', onPress: () => back() },
      { label: group.name },
    ] : null)
    return () => setFrameBreadcrumb(null)
  }, [setFrameBreadcrumb, group?.id, group?.name, back])
  const matches = (value: string) =>
    value.toLowerCase().includes(query.trim().toLowerCase())
  const version = group ? { id: group.id, expectedVersion: group.version } : {}
  const toolBar = (placeholder: string, label: string, onPress: () => void) => (
    <div className="members-toolbar">
      <label className="members-search">
        <Search aria-hidden="true" />
        <input
          type="search"
          aria-label={placeholder}
          placeholder={placeholder}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      <div className="members-toolbar-actions">
      <Button variant="ghost" size="icon" aria-label="Refresh members" disabled={busy} onPress={() => setRevision(value => value + 1)}><RefreshCw /></Button>
      <Button variant="outline" disabled={busy} onPress={onPress}>
        <Plus data-icon="inline-start" />
        {label}
      </Button>
      </div>
    </div>
  )
  const table = (members: Member[], inGroup = false) => (
    <div className="members-table-wrap">
      <table className="members-table">
        <thead>
          <tr>
            <th scope="col">Name</th>
            <th scope="col">{inGroup ? 'Account role' : 'Role'}</th>
            {!inGroup ? <th scope="col">Groups</th> : null}
            <th scope="col">Access</th>
            <th scope="col">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {members.map((member) => (
            <tr key={member.user.id}>
              <td>
                <strong>
                  {member.user.name}
                  {member.user.id === userId ? ' (you)' : ''}
                </strong>
                <span className="members-secondary">{member.user.email}</span>
              </td>
              <td>{roleName(member.role)}</td>
              {!inGroup ? (
                <td>
                  {member.groups.filter(
                    (item) =>
                      item.projectId === data?.projectId ||
                      (project && item.projectId === null)
                  ).length ? (
                    <div className="members-group-links">
                      {member.groups
                        .filter(
                          (item) =>
                            item.projectId === data?.projectId ||
                            (project && item.projectId === null)
                        )
                        .map((item) => (
                          <span key={item.id}>
                            {data?.groups.some(
                              (value) => value.id === item.id
                            ) ? (
                              <button
                                className="text-button"
                                onClick={() => {
                                  const next = data.groups.find(
                                    (value) => value.id === item.id
                                  )
                                  if (next) openGroup(next)
                                }}
                              >
                                {item.name}
                              </button>
                            ) : (
                              <>
                                {item.name}
                                <span className="members-secondary">
                                  Workspace group
                                </span>
                              </>
                            )}
                          </span>
                        ))}
                    </div>
                  ) : (
                    <span className="members-secondary">No groups</span>
                  )}
                </td>
              ) : null}
              <td>
                <Badge variant="success">Active</Badge>
                {project && member.role !== 'application' ? (
                  <span className="members-secondary">From workspace</span>
                ) : null}
              </td>
              <td>
                <div className="actions">
                  {inGroup ? (
                    <Button
                      variant="ghost"
                      disabled={busy}
                      onPress={() =>
                        setConfirmation({
                          title: `Remove ${member.user.name} from ${group!.name}?`,
                          description:
                            'They will lose permissions granted by this group. Other access stays in place.',
                          command: {
                            type: 'set_access_group_members',
                            ...version,
                            userIds: group!.userIds.filter(
                              (id) => id !== member.user.id
                            ),
                          },
                        })
                      }
                    >
                      Remove
                    </Button>
                  ) : member.user.id !== userId ? (
                    <>
                      {!project && member.directRole !== 'application' ? (
                        <Button
                          variant="outline"
                          disabled={busy}
                          onPress={() =>
                            setConfirmation({
                              title: `Change ${member.user.name}’s role?`,
                              description:
                                'This changes their direct workspace role. Group policies can grant additional access.',
                              command: {
                                type: 'update_member',
                                userId: member.user.id,
                                expectedRole: member.directRole,
                                role:
                                  member.directRole === 'owner'
                                    ? 'operator'
                                    : 'owner',
                              },
                            })
                          }
                        >
                          {member.directRole === 'owner'
                            ? 'Make operator'
                            : 'Make owner'}
                        </Button>
                      ) : null}
                      {!project ||
                      (member.role === 'application' && member.direct) ? (
                        <Button
                          variant="ghost"
                          disabled={busy}
                          onPress={() =>
                            setConfirmation({
                              title: `Remove ${member.user.name}?`,
                              description: project
                                ? 'Remove direct access to this application. Access granted by a group must be removed from that group.'
                                : 'They will lose workspace access and all group memberships. Records and history remain.',
                              command: project
                                ? {
                                    type: 'remove_application_member',
                                    userId: member.user.id,
                                  }
                                : {
                                    type: 'update_member',
                                    userId: member.user.id,
                                    expectedRole: member.directRole,
                                    role: 'remove',
                                  },
                            })
                          }
                        >
                          Remove
                        </Button>
                      ) : null}
                    </>
                  ) : null}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!members.length ? (
        <Empty title={query ? 'No members found' : 'No members yet'}>
          {query
            ? 'Try a different name or email.'
            : inGroup
              ? 'Add members to share the permissions in this group.'
              : 'Invite someone to start working together.'}
        </Empty>
      ) : null}
    </div>
  )
  const policyForm =
    group && form === 'policy' ? (
      <form
        className="stack members-policy-form"
        aria-busy={busy}
        onSubmit={(event) => {
          event.preventDefault()
          void mutate(
            {
              type: 'create_access_policy',
              ...version,
              ...(scope === 'application' ? { target } : {}),
              role,
            },
            'Permission policy created.'
          )
        }}
      >
        {error ? <Alert variant="danger">{error}</Alert> : null}
        <div className="members-policy-fields">
          <label>
            Scope
            <select
              className="input"
              autoFocus={!project}
              required
              disabled={busy || Boolean(project)}
              value={scope}
              onChange={(event) => {
                setScope(event.target.value)
                setTarget('')
                setRole('')
              }}
            >
              <option value="">Select a scope…</option>
              {!project ? <option value="workspace">Workspace</option> : null}
              <option value="application">Application</option>
            </select>
          </label>
          <label>
            Applies to
            <select
              className="input"
              required
              disabled={busy || !scope || Boolean(project)}
              value={scope === 'workspace' ? 'workspace' : target}
              onChange={(event) => setTarget(event.target.value)}
            >
              <option value="">Select an account…</option>
              {scope === 'workspace' ? (
                <option value="workspace">{accountName}</option>
              ) : (
                data?.projects
                  .filter((item) => !project || item.slug === project)
                  .map((item) => (
                    <option value={item.slug} key={item.id}>
                      {item.name}
                    </option>
                  ))
              )}
            </select>
          </label>
        </div>
        {scope ? (
          <fieldset className="members-role-options">
            <legend>Role</legend>
            {(scope === 'workspace' ? ['operator', 'owner'] : ['operator']).map(
              (value) => (
                <label key={value}>
                  <input
                    type="radio"
                    autoFocus={Boolean(project)}
                    name="policy-role"
                    value={value}
                    checked={role === value}
                    disabled={busy}
                    onChange={() => setRole(value)}
                  />
                  <span>
                    <strong>{roleName(value)}</strong>
                    <span className="members-secondary">
                      {value === 'owner'
                        ? 'Manage workspace members, applications, and agent access.'
                        : scope === 'workspace'
                          ? 'Work with records and permitted actions in every application.'
                          : 'Work with records and permitted actions in this application.'}
                    </span>
                  </span>
                </label>
              )
            )}
          </fieldset>
        ) : (
          <div className="members-policy-placeholder">
            Roles will appear after you select a scope.
          </div>
        )}
        <div className="dialog-actions">
          <Button
            variant="ghost"
            disabled={busy}
            onPress={() => {
              setForm(undefined)
              setError('')
            }}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={
              busy || !scope || !role || (scope === 'application' && !target)
            }
          >
            {busy ? 'Creating…' : 'Create policy'}
          </Button>
        </div>
      </form>
    ) : null
  return (
    <section
      className="account-members"
      data-embedded={embedded}
      data-group-detail={Boolean(group)}
      aria-label={`${accountName} members`}
      aria-busy={busy}
    >
      {group && setFrameBreadcrumb ? <Heading className="sr-only">{group.name}</Heading> : <div className="members-heading">
        <div>
          {group ? (
            <nav className="members-breadcrumb" aria-label="Member navigation">
              <button onClick={() => back(true)}>Members</button>
              <ChevronRight aria-hidden="true" />
              <button onClick={() => back()}>Groups</button>
              <ChevronRight aria-hidden="true" />
              <Heading aria-current="page">{group.name}</Heading>
            </nav>
          ) : (
            <>
              <Heading>Members</Heading>
              <p>
                Manage who can access {accountName} and the permissions they
                share.
              </p>
            </>
          )}
        </div>
        <Button
          variant="outline"
          className="members-heading-refresh"
          disabled={busy}
          onPress={() => setRevision((value) => value + 1)}
        >
          Refresh
        </Button>
      </div>}
      {error && form !== 'group' && form !== 'policy' && form !== 'invite' ? (
        <Alert variant="danger">{error}</Alert>
      ) : null}
      {notice ? (
        <p className="settings-notice" role="status">
          {notice}
        </p>
      ) : null}
      {!data ? (
        <div className="members-load-state"><p role="status">
          {busy
            ? 'Loading members…'
            : 'Members could not be loaded. Refresh to try again.'}
        </p><Button variant="outline" disabled={busy} onPress={() => setRevision(value => value + 1)}>Refresh</Button></div>
      ) : (
        <>
          {group ? (
            <>
              <Tabs
                label="Group sections"
                value={groupTab}
                onChange={(value) => {
                  setGroupTab(value)
                  setForm(undefined)
                  setQuery('')
                }}
                tabs={[
                  {
                    id: 'members',
                    label: 'Group members',
                    panel: (
                      <>
                        {toolBar('Search group members…', 'Add members', () => {
                          setSelectedUsers(group.userIds)
                          setForm('members')
                        })}
                        {form === 'members' ? (
                          <form
                            className="members-editor"
                            onSubmit={(event) => {
                              event.preventDefault()
                              void mutate(
                                {
                                  type: 'set_access_group_members',
                                  ...version,
                                  userIds: selectedUsers,
                                },
                                'Group members updated.'
                              )
                            }}
                          >
                            <h3>Add members</h3>
                            <p>
                              Choose existing workspace members. Permission
                              policies in this group grant additional access.
                            </p>
                            <fieldset className="members-picker">
                              <legend className="sr-only">Members</legend>
                              {data.availableMembers.map((member) => (
                                <label key={member.user.id}>
                                  <input
                                    type="checkbox"
                                    disabled={busy}
                                    checked={selectedUsers.includes(
                                      member.user.id
                                    )}
                                    onChange={(event) =>
                                      setSelectedUsers(
                                        event.target.checked
                                          ? [...selectedUsers, member.user.id]
                                          : selectedUsers.filter(
                                              (id) => id !== member.user.id
                                            )
                                      )
                                    }
                                  />
                                  <span>
                                    {member.user.name}
                                    <span className="members-secondary">
                                      {member.user.email}
                                    </span>
                                  </span>
                                </label>
                              ))}
                            </fieldset>
                            <div className="actions">
                              <Button
                                variant="ghost"
                                disabled={busy}
                                onPress={() => setForm(undefined)}
                              >
                                Cancel
                              </Button>
                              <Button type="submit" disabled={busy}>
                                Save members
                              </Button>
                            </div>
                          </form>
                        ) : null}
                        {table(
                          data.availableMembers.filter(
                            (member) =>
                              group.userIds.includes(member.user.id) &&
                              matches(
                                `${member.user.name} ${member.user.email}`
                              )
                          ),
                          true
                        )}
                      </>
                    ),
                  },
                  {
                    id: 'policies',
                    label: 'Permission policies',
                    panel: (
                      <>
                        {toolBar('Search policies…', 'Create policy', () => {
                          setScope(project ? 'application' : '')
                          setTarget(project ?? '')
                          setRole('')
                          setError('')
                          setNotice('')
                          setForm('policy')
                        })}
                        <p className="members-help">
                          Policies grant access to everyone in this group.
                          Direct roles and other group policies still apply.
                        </p>
                        <div className="members-table-wrap">
                          <table className="members-table">
                            <thead>
                              <tr>
                                <th scope="col">Scope</th>
                                <th scope="col">Applies to</th>
                                <th scope="col">Role</th>
                                <th scope="col">
                                  <span className="sr-only">Actions</span>
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {group.policies
                                .filter((policy) =>
                                  matches(
                                    `${policy.project?.name ?? accountName} ${policy.role} ${policy.project ? 'Application' : 'Workspace'}`
                                  )
                                )
                                .map((policy) => (
                                  <tr key={policy.id}>
                                    <td>
                                      {policy.project
                                        ? 'Application'
                                        : 'Workspace'}
                                    </td>
                                    <td>
                                      <strong>
                                        {policy.project?.name ?? accountName}
                                      </strong>
                                    </td>
                                    <td>{roleName(policy.role)}</td>
                                    <td>
                                      <Button
                                        variant="ghost"
                                        disabled={busy}
                                        onPress={() =>
                                          setConfirmation({
                                            title: 'Delete permission policy?',
                                            description:
                                              'Members will lose access granted by this policy. Other policies and direct roles still apply.',
                                            command: {
                                              type: 'delete_access_policy',
                                              ...version,
                                              policyId: policy.id,
                                            },
                                          })
                                        }
                                      >
                                        Delete
                                      </Button>
                                    </td>
                                  </tr>
                                ))}
                            </tbody>
                          </table>
                          {!group.policies.length ? (
                            <Empty title="No permission policies">
                              Create a policy to grant this group access to a
                              workspace or application.
                            </Empty>
                          ) : query &&
                            !group.policies.some((policy) =>
                              matches(
                                `${policy.project?.name ?? accountName} ${policy.role} ${policy.project ? 'Application' : 'Workspace'}`
                              )
                            ) ? (
                            <Empty title="No policies found">
                              Try a different scope, account, or role.
                            </Empty>
                          ) : null}
                        </div>
                      </>
                    ),
                  },
                  {
                    id: 'settings',
                    label: 'Settings',
                    panel: (
                      <form
                        className="members-editor"
                        onSubmit={(event) => {
                          event.preventDefault()
                          void mutate(
                            {
                              type: 'update_access_group',
                              ...version,
                              name,
                              description,
                            },
                            'Group settings saved.'
                          )
                        }}
                      >
                        <h3>Group settings</h3>
                        <Field
                          value={name}
                          onChange={setName}
                          isRequired
                          maxLength={80}
                          isDisabled={busy}
                        >
                          <FieldLabel>Group name</FieldLabel>
                          <Input />
                        </Field>
                        <Field
                          value={description}
                          onChange={setDescription}
                          maxLength={500}
                          isDisabled={busy}
                        >
                          <FieldLabel>Description</FieldLabel>
                          <Input />
                        </Field>
                        <div className="actions">
                          <Button
                            type="submit"
                            disabled={
                              busy ||
                              !name.trim() ||
                              (name === group.name &&
                                description === group.description)
                            }
                          >
                            Save changes
                          </Button>
                          <Button
                            variant="outline"
                            disabled={busy}
                            onPress={() =>
                              setConfirmation({
                                title: `Delete ${group.name}?`,
                                description:
                                  'Delete the group and all its permission policies. Members keep access from direct roles and other groups.',
                                command: {
                                  type: 'delete_access_group',
                                  ...version,
                                },
                              })
                            }
                          >
                            Delete group
                          </Button>
                        </div>
                      </form>
                    ),
                  },
                ]}
              />
            </>
          ) : (
            <Tabs
              label="Member sections"
              value={tab}
              onChange={(value) => {
                setTab(value)
                setForm(undefined)
                setQuery('')
              }}
              tabs={[
                {
                  id: 'members',
                  label: 'All members',
                  panel: (
                    <>
                      {toolBar(
                        'Search by name or email…',
                        'Invite members',
                        () => {
                          setEmail('')
                          setInviteRole('operator')
                          setError('')
                          setNotice('')
                          setInviteLink('')
                          setInviteCopied(false)
                          setForm('invite')
                        }
                      )}
                      {table(
                        data.members.filter((member) =>
                          matches(`${member.user.name} ${member.user.email}`)
                        )
                      )}
                      {data.invitations.length ? (
                        <section className="members-invitations">
                          <h3>Pending invitations</h3>
                          {data.invitations.map((invite) => (
                            <div className="settings-member" key={invite.id}>
                              <div className="settings-member-identity">
                                <strong>{invite.email}</strong>
                                <p>
                                  {roleName(invite.role ?? 'operator')} ·
                                  Expires {date(invite.expiresAt)}
                                </p>
                              </div>
                              <Button
                                variant="outline"
                                disabled={busy}
                                onPress={() => {
                                  setInviteLink('')
                                  void mutate(
                                    {
                                      type: project
                                        ? 'revoke_application_invitation'
                                        : 'revoke_invitation',
                                      id: invite.id,
                                    },
                                    'Invitation revoked.'
                                  )
                                }}
                              >
                                Revoke
                              </Button>
                            </div>
                          ))}
                        </section>
                      ) : null}
                    </>
                  ),
                },
                {
                  id: 'groups',
                  label: 'Groups',
                  panel: (
                    <>
                      {toolBar('Search groups…', 'Create group', () => {
                        setName('')
                        setDescription('')
                        setError('')
                        setNotice('')
                        setForm('group')
                      })}
                      <div className="members-table-wrap">
                        <table className="members-table">
                          <thead>
                            <tr>
                              <th scope="col">Group</th>
                              <th scope="col">Members</th>
                              <th scope="col">Permission policies</th>
                              <th scope="col">
                                <span className="sr-only">Open group</span>
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {data.groups
                              .filter((item) =>
                                matches(`${item.name} ${item.description}`)
                              )
                              .map((item) => (
                                <tr key={item.id}>
                                  <td>
                                    <button
                                      className="text-button members-group-name"
                                      onClick={() => openGroup(item)}
                                    >
                                      {item.name}
                                    </button>
                                    {item.description ? (
                                      <span className="members-secondary">
                                        {item.description}
                                      </span>
                                    ) : null}
                                  </td>
                                  <td>{item.userIds.length}</td>
                                  <td>{item.policies.length}</td>
                                  <td>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      aria-label={`Open ${item.name}`}
                                      onPress={() => openGroup(item)}
                                    >
                                      <ChevronRight />
                                    </Button>
                                  </td>
                                </tr>
                              ))}
                          </tbody>
                        </table>
                        {!data.groups.length ? (
                          <Empty title="Organize members into groups">
                            Create a group, add members, then define their
                            permission policies.
                          </Empty>
                        ) : !data.groups.some((item) =>
                            matches(`${item.name} ${item.description}`)
                          ) ? (
                          <Empty title="No groups found">
                            Try a different name or description.
                          </Empty>
                        ) : null}
                      </div>
                    </>
                  ),
                },
              ]}
            />
          )}
        </>
      )}
      <Dialog
        open={form === 'invite'}
        onOpenChange={(open) => {
          if (!open && !busy) { setForm(undefined); setError('') }
        }}
        title={inviteLink ? 'Invitation link ready' : 'Invite members'}
        description={inviteLink
          ? `Share this private link with ${email.trim()}. It expires in seven days. No email is sent.`
          : 'Create a private link for this email. It expires in seven days. No email is sent.'}
        className="members-create-dialog members-invite-dialog"
        isDismissable={!busy}
        showCloseButton={!busy}
      >
        {error ? <Alert variant="danger">{error}</Alert> : null}
        {inviteLink ? <div className="stack members-invite-result">
          <div className="members-invite-link-heading">
            <span id={`${inviteEmailId}-link`} className="field-label">Invitation link</span>
            <Button ref={inviteCopyButton} aria-label={inviteCopied ? 'Copy invite link again' : 'Copy invite link'} onPress={async () => {
              try { await navigator.clipboard.writeText(inviteLink); setInviteCopied(true); setError('') }
              catch { setError('Could not copy the link. Select the link text below and copy it manually.') }
            }}>{inviteCopied ? <Check data-icon="inline-start" /> : <Copy data-icon="inline-start" />}{inviteCopied ? 'Copied' : 'Copy link'}</Button>
          </div>
          <output className="members-invite-link" aria-labelledby={`${inviteEmailId}-link`}><code>{inviteLink}</code></output>
          <span className="sr-only" role="status">{inviteCopied ? 'Invitation link copied.' : ''}</span>
          <footer className="dialog-actions">
            <Button variant="outline" onPress={() => { setForm(undefined); setError('') }}>Done</Button>
          </footer>
        </div> : <form className="stack" aria-busy={busy} onSubmit={async event => {
          event.preventDefault()
          if (busy) return
          setBusy(true); setError('')
          try {
            const result = await request<{ token: string }>('/api/kernel', project
              ? { type: 'invite_application_user', project, email: email.trim() }
              : { type: 'invite_member', email: email.trim(), role: inviteRole })
            setInviteLink(project
              ? `${window.location.origin}/login?mode=signup&app=${encodeURIComponent(result.token)}`
              : `${window.location.origin}/settings?workspace=default#invite=${encodeURIComponent(result.token)}`)
            setRevision(value => value + 1)
          } catch (e) {
            setError(e instanceof Error ? e.message : 'Unable to create invitation. Try again.')
          } finally { setBusy(false) }
        }}>
          <div className="field">
            <label className="field-label" htmlFor={inviteEmailId}>Email address</label>
            <input id={inviteEmailId} className="input" name="email" type="email" required maxLength={254}
              autoFocus autoComplete="email" placeholder="colleague@company.com" disabled={busy}
              value={email} onChange={event => setEmail(event.target.value)} />
          </div>
          {!project ? <label className="members-invite-role">
            Role
            <select className="input" value={inviteRole} disabled={busy} onChange={event => setInviteRole(event.target.value)}>
              <option value="operator">Operator</option>
              <option value="owner">Owner</option>
            </select>
          </label> : null}
          <footer className="dialog-actions">
            <Button variant="outline" disabled={busy} onPress={() => { setForm(undefined); setError('') }}>Cancel</Button>
            <Button type="submit" disabled={busy || !email.trim()}>{busy ? 'Creating…' : 'Create invite link'}</Button>
          </footer>
        </form>}
      </Dialog>
      <Dialog
        open={Boolean(group) && form === 'policy'}
        onOpenChange={(open) => {
          if (!open && !busy) {
            setForm(undefined)
            setError('')
          }
        }}
        title="Create policy"
        className="members-create-dialog members-policy-dialog"
        isDismissable={!busy}
        showCloseButton={!busy}
      >
        {policyForm}
      </Dialog>
      <Dialog
        open={form === 'group'}
        onOpenChange={(open) => {
          if (!open && !busy) {
            setForm(undefined)
            setError('')
          }
        }}
        title="Create a user group"
        description="Groups let you assign permissions to multiple members at once. Give your group a name to get started."
        className="members-create-dialog"
        isDismissable={!busy}
        showCloseButton={!busy}
      >
        <form
          className="stack"
          aria-busy={busy}
          onSubmit={async (event) => {
            event.preventDefault()
            const result = await mutate(
              {
                type: 'create_access_group',
                name,
                description,
              },
              'Group created. Add members and permission policies.'
            )
            if (result?.id) {
              setGroupId(result.id)
              setGroupTab('members')
            }
          }}
        >
          {error ? <Alert variant="danger">{error}</Alert> : null}
          <Field
            value={name}
            onChange={setName}
            isRequired
            maxLength={80}
            isDisabled={busy}
          >
            <FieldLabel>Group name</FieldLabel>
            <Input autoFocus placeholder="e.g. Engineering, Marketing…" />
          </Field>
          <Field
            value={description}
            onChange={setDescription}
            maxLength={500}
            isDisabled={busy}
          >
            <FieldLabel>Description (optional)</FieldLabel>
            <Input />
          </Field>
          <div className="dialog-actions">
            <Button
              variant="ghost"
              disabled={busy}
              onPress={() => {
                setForm(undefined)
                setError('')
              }}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !name.trim()}>
              {busy ? 'Creating…' : 'Create group'}
            </Button>
          </div>
        </form>
      </Dialog>
      <Dialog
        open={Boolean(confirmation)}
        onOpenChange={(open) => {
          if (!open && !busy) setConfirmation(undefined)
        }}
        title={confirmation?.title ?? 'Confirm change'}
        description={confirmation?.description ?? ''}
      >
        <div className="dialog-actions">
          <Button
            variant="outline"
            disabled={busy}
            onPress={() => setConfirmation(undefined)}
          >
            Cancel
          </Button>
          <Button
            disabled={busy}
            onPress={async () => {
              if (!confirmation) return
              const result = await mutate(
                confirmation.command,
                'Access updated.'
              )
              setConfirmation(undefined)
              if (
                result &&
                (confirmation.command as { type: string }).type ===
                  'delete_access_group'
              )
                back()
            }}
          >
            Confirm change
          </Button>
        </div>
      </Dialog>
    </section>
  )
}
