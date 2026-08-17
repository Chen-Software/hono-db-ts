import { css } from '../../../../design-system/css'
import { createRoute } from 'honox/factory'
import { Anchor, Button, Card, Heading, Stack, Text } from '../../../components/ui'
import { RepoSettingsLayout } from '../../../components/repo-settings-layout'
import { SiteHeader } from '../../../components/site-header'
import { apiFetch } from '../../../lib/api'

/**
 * Repository settings page — `/{owner}/{repo}/settings`.
 *
 * Pure SSR. GET resolves the repository by its canonical `{owner}/{name}` path
 * (via the by-owner endpoint) and renders the "General" settings form: display
 * name, URL slug, visibility, description, default branch and homepage.
 *
 * POST applies the changes through the JSON API (`/page/repositories/by-owner/
 * :owner/:name/settings`) and redirects back to the settings page. If the repo
 * is renamed the redirect follows the new canonical URL.
 *
 * The page uses the Forgejo-style "settings with a left nav" layout: a side
 * column of settings links plus the main settings card on the right. Missing
 * repositories 404.
 */

type Repository = {
	id: string
	name: string
	lowerName: string
	description: string
	defaultBranch: string
	website: string
	isPrivate: boolean
	created_at: string
}

type Owner = { id: string; name: string } | null

export default createRoute(async (c) => {
	const userId = c.req.param('userId')
	const repositoryName = c.req.param('repositoryName')

	// SSR: resolve the repo by its canonical `{owner}/{name}` path.
	const page: any = await apiFetch(c, `/page/repositories/by-owner/${encodeURIComponent(userId)}/${encodeURIComponent(repositoryName)}`)
	const repository: Repository | null = page?.repository ?? null
	const owner: Owner = page?.owner ?? null

	if (!repository) {
		c.status(404)
		return c.render(
			<div class={css({ minHeight: '100vh', bg: '#f7f7f8', color: 'ink', fontFamily: 'ui-sans-serif, system-ui, sans-serif' })}>
				<title>Repository not found · CodeForge</title>
				<SiteHeader />
				<main class={css({ maxWidth: '6xl', mx: 'auto', px: 6, py: 16, textAlign: 'center' })}>
					<Heading class={css({ fontSize: '2xl', fontWeight: 800 })}>Repository not found</Heading>
					<Text class={css({ mt: 2, fontSize: 'sm', color: 'muted' })}>
						No repository at <code class={css({ color: 'accent' })}>{userId}/{repositoryName}</code>.
					</Text>
					<Button as="a" href="/" size="sm" class={css({ mt: 6 })}>
						Back to home
					</Button>
				</main>
			</div>,
		)
	}

	const ownerName = owner?.name ?? userId
	const slug = repository.lowerName || repository.name
	const repoHref = `/${ownerName}/${slug}`

	return c.render(
		<RepoSettingsLayout
			ownerName={ownerName}
			repositoryName={repositoryName}
			repository={repository}
			active="general"
			children={
				<div class={css({ spaceY: 6, minWidth: 0 })}>
					<title>Settings · {repository.name} · CodeForge</title>
						{/* General settings */}
						<Card class={css({ p: 6, width: 'full' })}>
							<Heading class={css({ fontSize: 'lg', fontWeight: 800 })}>General</Heading>
							<Text class={css({ mt: 1, fontSize: 'sm', color: 'muted' })}>
								Basic information about this repository. Renaming updates the canonical
								<code class={css({ mx: 1, color: 'accent' })}>{`/{owner}/{repo}`}</code> URL.
							</Text>

							<form method="post" action={`/${ownerName}/${slug}/settings`} class={css({ mt: 6, spaceY: 6 })}>
								<input type="hidden" name="action" value="save" />

								{/* Name */}
								<div>
									<label class={css({ display: 'block', mb: 1.5, fontSize: 'xs', fontWeight: 600, color: 'muted' })}>
										Repository name
									</label>
									<input
										name="name"
										required
										maxLength={255}
										defaultValue={repository.name}
										class={css({ w: 'full', px: 3, py: 2, rounded: 'md', border: '1px solid token(colors.border)', bg: 'white', fontSize: 'sm', outline: 'none', _focus: { borderColor: 'accent' } })}
									/>
									<p class={css({ mt: 1, fontSize: 'xs', color: 'faint' })}>
										Display name — shown in the header and listing pages.
									</p>
								</div>

								{/* Slug */}
								<div>
									<label class={css({ display: 'block', mb: 1.5, fontSize: 'xs', fontWeight: 600, color: 'muted' })}>
										URL slug
									</label>
									<div class={css({ display: 'flex', alignItems: 'center', gap: 2 })}>
										<Text class={css({ fontSize: 'sm', color: 'faint' })}>{ownerName}/</Text>
										<input
											name="lowerName"
											required
											maxLength={255}
											defaultValue={slug}
											class={css({ flex: 1, px: 3, py: 2, rounded: 'md', border: '1px solid token(colors.border)', bg: 'white', fontSize: 'sm', outline: 'none', _focus: { borderColor: 'accent' } })}
										/>
									</div>
									<p class={css({ mt: 1, fontSize: 'xs', color: 'faint' })}>
										URL-safe identifier (lowercase, hyphenated). Changing this renames the repository and its clone URL.
									</p>
								</div>

								{/* Visibility */}
								<div>
									<span class={css({ display: 'block', mb: 1.5, fontSize: 'xs', fontWeight: 600, color: 'muted' })}>
										Visibility
									</span>
									<div class={css({ spaceY: 2 })}>
										<label class={css({ display: 'flex', alignItems: 'center', gap: 2, fontSize: 'sm', cursor: 'pointer' })}>
											<input
												type="radio"
												name="visibility"
												value="public"
												defaultChecked={!repository.isPrivate}
												class={css({ accentColor: 'accent' })}
											/>
											<span>
												<Text as="span" class={css({ fontWeight: 600, color: 'ink' })}>Public</Text>
												<Text as="span" class={css({ display: 'block', fontSize: 'xs', color: 'muted' })}>
													Anyone on the internet can see this repository.
												</Text>
											</span>
										</label>
										<label class={css({ display: 'flex', alignItems: 'center', gap: 2, fontSize: 'sm', cursor: 'pointer' })}>
											<input
												type="radio"
												name="visibility"
												value="private"
												defaultChecked={Boolean(repository.isPrivate)}
												class={css({ accentColor: 'accent' })}
											/>
											<span>
												<Text as="span" class={css({ fontWeight: 600, color: 'ink' })}>Private</Text>
												<Text as="span" class={css({ display: 'block', fontSize: 'xs', color: 'muted' })}>
													Only collaborators can see this repository.
												</Text>
											</span>
										</label>
									</div>
								</div>

								{/* Description */}
								<div>
									<label class={css({ display: 'block', mb: 1.5, fontSize: 'xs', fontWeight: 600, color: 'muted' })}>
										Description
									</label>
									<textarea
										name="description"
										rows={3}
										maxLength={1000}
										defaultValue={repository.description}
										class={css({ w: 'full', px: 3, py: 2, rounded: 'md', border: '1px solid token(colors.border)', bg: 'white', fontSize: 'sm', outline: 'none', resize: 'vertical', _focus: { borderColor: 'accent' } })}
									/>
								</div>

								{/* Default branch */}
								<div>
									<label class={css({ display: 'block', mb: 1.5, fontSize: 'xs', fontWeight: 600, color: 'muted' })}>
										Default branch
									</label>
									<input
										name="defaultBranch"
										maxLength={255}
										defaultValue={repository.defaultBranch || 'main'}
										class={css({ w: 'full', px: 3, py: 2, rounded: 'md', border: '1px solid token(colors.border)', bg: 'white', fontSize: 'sm', outline: 'none', _focus: { borderColor: 'accent' } })}
									/>
									<p class={css({ mt: 1, fontSize: 'xs', color: 'faint' })}>
										The branch the code tab and clone default to.
									</p>
								</div>

								{/* Website */}
								<div>
									<label class={css({ display: 'block', mb: 1.5, fontSize: 'xs', fontWeight: 600, color: 'muted' })}>
										Website
									</label>
									<input
										name="website"
										type="url"
										maxLength={255}
										defaultValue={repository.website || ''}
										placeholder="https://example.com"
										class={css({ w: 'full', px: 3, py: 2, rounded: 'md', border: '1px solid token(colors.border)', bg: 'white', fontSize: 'sm', outline: 'none', _focus: { borderColor: 'accent' } })}
									/>
								</div>

								{/* Template (matches Forgejo's `repo.template` checkbox) */}
								<div>
									<label class={css({ display: 'flex', alignItems: 'center', gap: 2, fontSize: 'sm', cursor: 'pointer' })}>
										<input
											type="checkbox"
											name="template"
											defaultChecked={Boolean(repository.isTemplate)}
											class={css({ accentColor: 'accent' })}
										/>
										<span>
											<Text as="span" class={css({ fontWeight: 600, color: 'ink' })}>Template repository</Text>
											<Text as="span" class={css({ display: 'block', fontSize: 'xs', color: 'muted' })}>
												Allow others to create repositories from this one as a starting point.
											</Text>
										</span>
									</label>
								</div>

								{/* Actions */}
								<Stack direction="horizontal" align="center" gap="3" class={css({ pt: 2, borderTop: '1px solid token(colors.border)' })}>
									<Button type="submit" size="md">
										Save changes
									</Button>
									<Anchor
										href={repoHref}
										variant="plain"
										class={css({ px: 4, py: 2, rounded: 'md', border: '1px solid token(colors.border)', fontSize: 'sm', color: 'muted' })}
									>
										Cancel
									</Anchor>
								</Stack>
							</form>
						</Card>

						{/* Danger zone (Forgejo-style, owner-only destructive actions) */}
						<Card class={css({ p: 6, width: 'full', border: '1px solid #fecaca' })}>
							<Heading class={css({ fontSize: 'lg', fontWeight: 800, color: '#b91c1c' })}>Danger zone</Heading>
							<Text class={css({ mt: 1, fontSize: 'sm', color: 'muted' })}>
								Irreversible actions on this repository.
							</Text>

							{/* Archive / unarchive */}
							<Stack direction="horizontal" justify="between" align="center" class={css({ mt: 4, pt: 4, borderTop: '1px solid #fee2e2' })}>
								<div>
									<Text class={css({ fontSize: 'sm', fontWeight: 600, color: 'ink' })}>
										{repository.isArchived ? 'Unarchive this repository' : 'Archive this repository'}
									</Text>
									<Text class={css({ fontSize: 'xs', color: 'muted' })}>
										{repository.isArchived
											? 'Restore this repository to active use.'
											: 'Make the repository read-only for everyone. This can be undone.'}
									</Text>
								</div>
								<form method="post" action={repoHref + '/settings'} class={css({ display: 'inline' })}>
									<input type="hidden" name="action" value={repository.isArchived ? 'unarchive' : 'archive'} />
									<Button type="submit" variant="outline" size="sm" class={css({ borderColor: '#fecaca', color: '#b91c1c' })}>
										{repository.isArchived ? 'Unarchive' : 'Archive'}
									</Button>
								</form>
							</Stack>

							{/* Transfer ownership (placeholder until the transfer service lands) */}
							<Stack direction="horizontal" justify="between" align="center" class={css({ mt: 4, pt: 4, borderTop: '1px solid #fee2e2' })}>
								<div>
									<Text class={css({ fontSize: 'sm', fontWeight: 600, color: 'ink' })}>Transfer ownership</Text>
									<Text class={css({ fontSize: 'xs', color: 'muted' })}>Move this repository to another user or organization.</Text>
								</div>
								<Button variant="outline" size="sm" disabled class={css({ borderColor: '#fecaca', color: '#b91c1c', opacity: 0.6 })}>
									Transfer
								</Button>
							</Stack>

							{/* Delete (requires typing the repo name, like Forgejo) */}
							<Stack direction="horizontal" justify="between" align="center" class={css({ mt: 4, pt: 4, borderTop: '1px solid #fee2e2' })}>
								<div>
									<Text class={css({ fontSize: 'sm', fontWeight: 600, color: 'ink' })}>Delete this repository</Text>
									<Text class={css({ fontSize: 'xs', color: 'muted' })}>
										Permanently delete the repository and all of its data. You will be asked to confirm by typing{' '}
										<code class={css({ color: '#b91c1c' })}>{ownerName}/{slug}</code>.
									</Text>
								</div>
								<form method="post" action={repoHref + '/settings'} onsubmit="return false" class={css({ display: 'inline' })}>
									<input type="hidden" name="action" value="delete" />
									<Button type="submit" variant="outline" size="sm" disabled class={css({ borderColor: '#fecaca', color: '#b91c1c', opacity: 0.6 })}>
										Delete this repository
									</Button>
								</form>
							</Stack>
						</Card>
					</div>
			}
		/>,
	)
})

/**
 * POST /{owner}/{repo}/settings — apply the general settings. Delegated to the
 * service layer via the JSON API, which returns a redirect (following a rename)
 * that we stream back to the browser.
 */
export const POST = createRoute(async (c) => {
	const userId = c.req.param('userId')
	const repositoryName = c.req.param('repositoryName')
	return apiPostForm(c, `/page/repositories/by-owner/${encodeURIComponent(userId)}/${encodeURIComponent(repositoryName)}/settings`)
})
