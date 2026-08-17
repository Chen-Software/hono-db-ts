import { createRoute } from 'honox/factory'
import { apiFetch } from '../../../../../lib/api'

/**
 * Raw file download — `/{owner}/{repo}/raw/{ref}/{path...}`.
 *
 * Mirrors Forgejo's `/raw/{branchname}/{path}` (`repo.SingleDownload`). Returns
 * the file's raw bytes with a content type + `Content-Disposition`, so links
 * and browser navigation can download/inspect the file directly. The ref may be
 * a branch, tag, or commit sha (the git resolver accepts all three).
 *
 * This is a non-JSON honox route: it streams the blob from the JSON `/read`
 * API and responds with the raw bytes.
 */

export default createRoute(async (c) => {
	const userId = c.req.param('userId')
	const repositoryName = c.req.param('repositoryName')
	const ref = c.req.param('ref') ?? ''
	const path = (c.req.param('path') ?? '').split('/').filter(Boolean).join('/')

	if (!ref || !path) return c.body('Bad request', 400)

	// Resolve the repo to its UUID.
	const page: any = await apiFetch(c, `/page/repositories/by-owner/${encodeURIComponent(userId)}/${encodeURIComponent(repositoryName)}`)
	const repository = page?.repository
	if (!repository) return c.body('Not found', 404)

	const qs = new URLSearchParams()
	qs.set('ref', ref)
	qs.set('path', path)
	const file: any = await apiFetch(c, `/page/repositories/${repository.id}/read?${qs.toString()}`)
	if (!file || !file.content) return c.body('Not found', 404)

	const bytes =
		file.encoding === 'base64'
			? Buffer.from(file.content as string, 'base64')
			: new TextEncoder().encode(file.content as string)

	const fileName = path.split('/').pop() ?? path
	return new Response(bytes, {
		status: 200,
		headers: {
			'content-type': file.encoding === 'base64' ? 'application/octet-stream' : 'text/plain; charset=utf-8',
			'content-disposition': `inline; filename="${fileName}"`,
			'cache-control': 'public, max-age=60',
		},
	})
})
