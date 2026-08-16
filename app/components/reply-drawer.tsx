import { css } from '../../../design-system/css'
import { Button, Drawer } from '../ui'

export type ReplyDraft = {
	id: string
	body: string
}

type ReplyDrawerProps = {
	threadId: string
	reply: ReplyDraft
	trigger?: JSX.Element
}

/**
 * Drawer for editing an existing reply. Mirrors `ThreadDrawer`: the body is a
 * native-POST form that submits to the thread route (`/threads/:id`), which
 * forwards `action=edit-reply` to the service-layer update endpoint. That
 * endpoint enforces that only the original author may edit (see
 * `src/services/threads.ts#updateReply`).
 */
export function ReplyDrawer({ threadId, reply, trigger }: ReplyDrawerProps) {
	const body = (
		<form
			method="post"
			action={`/threads/${threadId}`}
			class={css({ spaceY: 3, width: 'full' })}
		>
			<input type="hidden" name="action" value="edit-reply" />
			<input type="hidden" name="replyId" value={reply.id} />
			<textarea
				name="body"
				required
				rows={5}
				defaultValue={reply.body}
				class={css({ width: 'full', minHeight: '120px' })}
			/>
			<Button variant="primary" type="submit">
				Save changes
			</Button>
		</form>
	)

	return (
		<Drawer
			trigger={trigger}
			title="Edit reply"
			description="Update what you wrote."
			body={body}
		/>
	)
}
