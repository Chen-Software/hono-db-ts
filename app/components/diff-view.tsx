import { css } from '../../design-system/css'
import { Badge, Stack, Text } from './ui'

/**
 * Shared unified-diff renderer (Forgejo/GitHub-style).
 *
 * Given the `FileDiff[]` array returned by the `/commit/:oid/diff`,
 * `/compare`, and `/commits` JSON endpoints, renders:
 *
 *   - a file header per change (status badge + path + ±line counts)
 *   - each hunk as a monospace grid: old-line no. | new-line no. | content,
 *     with green/red backgrounds for added/deleted lines
 *   - an empty state for binary/truncated files ("Binary file not shown")
 *   - the total diff stats bar (files / additions / deletions)
 *
 * All server-rendered — no client JS.
 */

export type DiffLine = {
	type: 'add' | 'del' | 'ctx'
	content: string
	oldLine?: number
	newLine?: number
}

export type DiffHunk = {
	header: string
	oldStart: number
	oldLines: number
	newStart: number
	newLines: number
	lines: DiffLine[]
}

export type FileDiff = {
	path: string
	oldPath?: string
	status: 'added' | 'modified' | 'deleted' | 'renamed'
	oldOid?: string
	newOid?: string
	additions: number
	deletions: number
	binary: boolean
	truncated: boolean
	hunks?: DiffHunk[]
}

export type CommitDiff = {
	base: string
	head: string
	files: FileDiff[]
	stats: { files: number; additions: number; deletions: number }
}

const STATUS_META: Record<FileDiff['status'], { label: string; color: 'green' | 'red' | 'blue' | 'gray' }> = {
	added: { label: 'added', color: 'green' },
	modified: { label: 'modified', color: 'blue' },
	deleted: { label: 'deleted', color: 'red' },
	renamed: { label: 'renamed', color: 'gray' },
}

function lineColor(type: DiffLine['type']): string {
	switch (type) {
		case 'add':
			return 'bg: #e6ffec;'
		case 'del':
			return 'bg: #ffebe9;'
		default:
			return ''
	}
}

function lineTextColor(type: DiffLine['type']): string {
	return type === 'add' ? '#1a7f37' : type === 'del' ? '#cf222e' : '#1f2328'
}

/** A single file's diff (header + hunks). */
function FileBlock({
	file,
	pathHref,
}: {
	file: FileDiff
	/** Optional link for the file path (blob view on the compare page). */
	pathHref?: string
}) {
	const meta = STATUS_META[file.status]
	const showHunks = !file.binary && !file.truncated && !!file.hunks?.length
	return (
		<div class={css({ rounded: 'lg', border: '1px solid token(colors.border)', overflow: 'hidden', bg: 'white' })}>
			{/* File header */}
			<Stack direction="horizontal" align="center" gap="3" class={css({ px: 4, py: 2.5, borderBottom: '1px solid token(colors.border)', bg: '#fafafa' })}>
				<Badge variant="subtle" colorPalette={meta.color} class={css({ fontSize: 'xs' })}>
					{meta.label}
				</Badge>
				{pathHref ? (
					<a
						href={pathHref}
						class={css({ fontSize: 'sm', fontWeight: 600, color: 'accent', truncate: true, flex: 1, minWidth: 0, textDecoration: 'none', _hover: { textDecoration: 'underline' } })}
					>
						{file.status === 'renamed' && file.oldPath ? `${file.oldPath} → ` : ''}
						{file.path}
					</a>
				) : (
					<Text class={css({ fontSize: 'sm', fontWeight: 600, color: 'ink', truncate: true, flex: 1, minWidth: 0 })}>
						{file.status === 'renamed' && file.oldPath ? `${file.oldPath} → ` : ''}
						{file.path}
					</Text>
				)}
				{!file.binary && (
					<Stack direction="horizontal" align="center" gap="2" class={css({ fontSize: 'xs', flexShrink: 0 })}>
						<Text as="span" class={css({ color: '#1a7f37', fontWeight: 600 })}>+{file.additions}</Text>
						<Text as="span" class={css({ color: '#cf222e', fontWeight: 600 })}>−{file.deletions}</Text>
					</Stack>
				)}
			</Stack>

			{showHunks ? (
				<div class={css({ divideY: '1px solid #ececee' })}>
					{file.hunks!.map((h, hi) => (
						<div key={hi}>
							<Text class={css({ px: 4, py: 1, fontSize: 'xs', color: '#57606a', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', bg: '#f6f8fa', borderBottom: '1px solid #ececee' })}>
								{h.header}
							</Text>
							<div class={css({ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', fontSize: 'xs', lineHeight: 1.6, overflowX: 'auto' })}>
								{h.lines.map((l, li) => (
									<div
										key={li}
										class={css({ display: 'grid', gridTemplateColumns: '3.5rem 3.5rem 1fr', whiteSpace: 'pre', ...(l.type === 'ctx' ? {} : {}) })}
										style={lineColor(l.type)}
									>
										<span class={css({ textAlign: 'right', px: 1.5, pr: 2, userSelect: 'none', color: 'rgba(31,35,40,0.35)' })}>
											{l.type === 'del' ? (l.oldLine ?? '') : l.type === 'ctx' ? (l.oldLine ?? '') : ''}
										</span>
										<span class={css({ textAlign: 'right', px: 1.5, pr: 2, userSelect: 'none', color: 'rgba(31,35,40,0.35)' })}>
											{l.type === 'add' ? (l.newLine ?? '') : l.type === 'ctx' ? (l.newLine ?? '') : ''}
										</span>
										<span class={css({ pl: 2, color: lineTextColor(l.type) })}>
											{l.type === 'add' ? '+' : l.type === 'del' ? '−' : ' '}
											{l.content}
										</span>
									</div>
								))}
							</div>
						</div>
					))}
				</div>
			) : (
				<div class={css({ px: 4, py: 6, textAlign: 'center' })}>
					<Text class={css({ fontSize: 'xs', color: 'faint' })}>
						{file.binary ? 'Binary file not shown.' : file.truncated ? 'File too large to render.' : 'No changes.'}
					</Text>
				</div>
			)}
		</div>
	)
}

/**
 * The full diff view: stats bar + one block per changed file.
 * `pathHrefFor` optionally links each changed file's path (the compare page
 * links to the blob view for the head ref).
 */
export function DiffView({
	diff,
	pathHrefFor,
}: {
	diff: CommitDiff
	pathHrefFor?: (path: string, status: FileDiff['status']) => string | undefined
}) {
	const { stats } = diff
	return (
		<div class={css({ spaceY: 4 })}>
			{/* Stats bar */}
			<Stack direction="horizontal" align="center" gap="3" class={css({ px: 4, py: 2.5, rounded: 'md', bg: '#f6f8fa', border: '1px solid token(colors.border)', fontSize: 'sm' })}>
				<Text as="span" class={css({ fontWeight: 600, color: 'ink' })}>
					{stats.files} file{stats.files === 1 ? '' : 's'} changed
				</Text>
				<Text as="span" class={css({ color: '#1a7f37', fontWeight: 600 })}>+{stats.additions}</Text>
				<Text as="span" class={css({ color: '#cf222e', fontWeight: 600 })}>−{stats.deletions}</Text>
			</Stack>

			{diff.files.length > 0 ? (
				diff.files.map((f) => (
					<FileBlock
						key={`${f.oldPath ?? ''}${f.path}`}
						file={f}
						pathHref={pathHrefFor ? pathHrefFor(f.path, f.status) : undefined}
					/>
				))
			) : (
				<div class={css({ py: 12, textAlign: 'center', rounded: 'lg', border: '1px dashed token(colors.border)', bg: 'white' })}>
					<Text class={css({ fontSize: 'sm', color: 'faint' })}>No changes between these refs.</Text>
				</div>
			)}
		</div>
	)
}
