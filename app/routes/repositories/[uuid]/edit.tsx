import { css } from '../../../../design-system/css'
import { createRoute } from 'honox/factory'
import { Anchor, Button, Card, Heading, Stack, Text } from '../../../components/ui'
import { SiteHeader } from '../../../components/site-header'
import { apiFetch, apiPostForm } from '../../../lib/api'

/**
 * Repository edit page — `/repositories/:uuid/edit`.
 *
 * Pure SSR. GET renders an edit form for a repository (name, slug, description,
 * private); POST applies the update then redirects back to the repository. The
 * owner is immutable after creation.
 */

export default createRoute(async (c) => {
	const uuid = c.req.param('uuid')

	// SSR: the edit form is fetched over HTTP from the JSON API (service layer).
	const page: any = await apiFetch(c, `/page/repositories/${uuid}/edit`)
	const repository = page?.repository ?? null

	if (!repository) {
		c.status(404)
		return c.render(
			<div class={css({ minHeight: '100vh', bg: '#f7f7f8', color: 'ink', fontFamily: 'ui-sans-serif, system-ui, sans-serif' })}>
				<title>Repository not found · Git Forge</title>
				<Nav />
				<main class={css({ maxWidth: '6xl', mx: 'auto', px: 6, py: 16, textAlign: 'center' })}>
					<Heading class={css({ fontSize: '2xl', fontWeight: 800 })}>Repository not found</Heading>
					<Text class={css({ mt: 2, fontSize: 'sm', color: 'muted' })}>
						No repository with id <code>{uuid}</code>.
					</Text>
					<Button as="a" href="/repositories" size="sm" class={css({ mt: 6 })}>
						Back to repositories
					</Button>
				</main>
			</div>,
		)
	}

	return c.render(
		<div class={css({ minHeight: '100vh', bg: '#f7f7f8', color: 'ink', fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' })}>
			<title>Edit · {repository.name} · Git Forge</title>
			<Nav />

			<main class={css({ maxWidth: '3xl', mx: 'auto', px: 6, py: 10 })}>
				{/* Breadcrumb */}
				<Stack direction="horizontal" align="center" gap="2" class={css({ fontSize: 'sm', color: 'muted', mb: 6 })}>
					<Anchor href="/repositories" variant="plain" class={css({ color: 'muted' })}>
						Repositories
					</Anchor>
					<span aria-hidden>›</span>
					<Anchor href={`/repositories/${repository.id}`} variant="plain" class={css({ color: 'muted' })}>
						{repository.name}
					</Anchor>
					<span aria-hidden>›</span>
					<Text class={css({ color: 'ink', fontWeight: 500 })}>Edit</Text>
				</Stack>

				{/* Edit form */}
				<Card class={css({ p: 6, width: 'full' })}>
					<Heading class={css({ fontSize: 'xl', fontWeight: 800 })}>Edit repository</Heading>
					<Text class={css({ mt: 1, fontSize: 'sm', color: 'muted' })}>
						Update the repository's display name, slug and description. The owner is
						fixed at creation.
					</Text>

					<form method="post" action={`/repositories/${repository.id}/edit`} class={css({ mt: 6, spaceY: 5 })}>
						<input type="hidden" name="action" value="save" />

						{/* Name */}
						<div>
							<label class={css({ display: 'block', mb: 1.5, fontSize: 'xs', fontWeight: 600, color: 'muted' })}>
								Name
							</label>
							<input
								name="name"
								required
								maxLength={255}
								defaultValue={repository.name}
								class={css({ w: 'full', px: 3, py: 2, rounded: 'md', border: '1px solid token(colors.border)', fontSize: 'sm', outline: 'none', _focus: { borderColor: 'accent' } })}
							/>
						</div>

						{/* Slug */}
						<div>
							<label class={css({ display: 'block', mb: 1.5, fontSize: 'xs', fontWeight: 600, color: 'muted' })}>
								Slug
							</label>
							<input
								name="lowerName"
								required
								maxLength={255}
								defaultValue={repository.lowerName}
								class={css({ w: 'full', px: 3, py: 2, rounded: 'md', border: '1px solid token(colors.border)', fontSize: 'sm', outline: 'none', _focus: { borderColor: 'accent' } })}
							/>
							<p class={css({ mt: 1, fontSize: 'xs', color: 'faint' })}>URL-safe identifier (lowercase, hyphenated).</p>
						</div>

						{/* Description */}
						<div>
							<label class={css({ display: 'block', mb: 1.5, fontSize: 'xs', fontWeight: 600, color: 'muted' })}>
								Description
							</label>
							<textarea
								name="description"
								rows={5}
								maxLength={1000}
								defaultValue={repository.description}
								class={css({ w: 'full', px: 3, py: 2, rounded: 'md', border: '1px solid token(colors.border)', fontSize: 'sm', outline: 'none', resize: 'vertical', _focus: { borderColor: 'accent' } })}
							/>
						</div>

						{/* Private */}
						<label class={css({ display: 'flex', alignItems: 'center', gap: 2, fontSize: 'sm', cursor: 'pointer' })}>
							<input
								type="checkbox"
								name="isPrivate"
								value="1"
								checked={Boolean(repository.isPrivate)}
								class={css({ accentColor: 'accent' })}
							/>
							Private (only you can see it)
						</label>

						{/* Actions */}
						<Stack direction="horizontal" align="center" gap="3" class={css({ pt: 2 })}>
							<Button type="submit" size="md">
								Save changes
							</Button>
							<Anchor
								href={`/repositories/${repository.id}`}
								variant="plain"
								class={css({ px: 4, py: 2, rounded: 'md', border: '1px solid token(colors.border)', fontSize: 'sm', color: 'muted' })}
							>
								Cancel
							</Anchor>
						</Stack>
					</form>
				</Card>
			</main>
		</div>,
	)
})

/** Shared top navigation — mirrors the home page's header. */
function Nav() {
	return <SiteHeader />
}

/**
 * POST /repositories/:uuid/edit — apply the edited fields. Delegated to the
 * service layer via the JSON API, which returns a redirect we stream back to
 * the browser.
 */
export const POST = createRoute(async (c) => {
	const uuid = c.req.param('uuid')
	return apiPostForm(c, `/page/repositories/${uuid}/edit`)
})
