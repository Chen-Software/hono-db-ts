import { css } from "design-system/css";
import type { JSX } from "hono/jsx";
import { Button } from "./ui/button";
import { Drawer } from "./ui/drawer";

/** Data for editing an existing thread (omitted for create mode). */
export type ThreadDraft = {
  id: string;
  title: string;
  boardId: string;
  pinned?: boolean;
  locked?: boolean;
};

type ThreadDrawerProps = {
  boards: { id: string; name: string }[];
  /** When provided, the drawer opens in edit mode, prefilled from this thread. */
  thread?: ThreadDraft;
  defaultOpen?: boolean;
  /** Override the trigger element (defaults to a "New thread" button). */
  trigger?: JSX.Element;
};

const labelCss = css({
  display: "block",
  mb: 1.5,
  fontSize: "xs",
  fontWeight: 600,
  color: "muted",
});

const fieldCss = css({
  width: "full",
  rounded: "md",
  border: "1px solid token(colors.border)",
  fontSize: "sm",
  bg: "white",
  px: 3,
  py: 2,
  outline: "none",
  _focus: { borderColor: "accent" },
});

/**
 * Thread editor rendered in a Drawer. Shared by "new" (no `thread` prop) and
 * "edit" (a `thread` prop) flows — the only differences are the submit target,
 * the hidden `action` value, the prefilled values, and the edit-only pinned/
 * locked toggles. The form is a native no-JS submit:
 *   - create → POST `/` with `action=create` (home route handler)
 *   - edit   → POST `/threads/:id` with `action=save` (detail route handler)
 */
export function ThreadDrawer({ boards, thread, defaultOpen = false, trigger }: ThreadDrawerProps) {
  const isEdit = Boolean(thread);
  const formAction = thread ? `/threads/${thread.id}` : "/";
  const actionValue = thread ? "save" : "create";

  const triggerEl = trigger ?? (
    <Button variant="primary" type="button">
      New thread
    </Button>
  );

  const body = (
    <form method="post" action={formAction} class={css({ spaceY: 3 })}>
      <input type="hidden" name="action" value={actionValue} />

      <div>
        <label class={labelCss}>Title</label>
        <input
          name="title"
          placeholder="Thread title…"
          required
          maxLength={300}
          defaultValue={thread?.title ?? ""}
          class={fieldCss}
        />
      </div>

      <div>
        <label class={labelCss}>Board</label>
        <select name="boardId" required class={fieldCss}>
          <option value="">Board…</option>
          {boards.map((b) => (
            <option key={b.id} value={b.id} selected={b.id === thread?.boardId}>
              {b.name}
            </option>
          ))}
        </select>
      </div>

      {isEdit && (
        <div class={css({ display: "flex", gap: 8 })}>
          <label class={css({ display: "flex", alignItems: "center", gap: 2, fontSize: "sm", cursor: "pointer" })}>
            <input
              type="checkbox"
              name="pinned"
              value="1"
              checked={thread?.pinned === true}
              class={css({ accentColor: "accent" })}
            />
            Pin thread
          </label>
          <label class={css({ display: "flex", alignItems: "center", gap: 2, fontSize: "sm", cursor: "pointer" })}>
            <input
              type="checkbox"
              name="locked"
              value="1"
              checked={thread?.locked === true}
              class={css({ accentColor: "accent" })}
            />
            Lock thread
          </label>
        </div>
      )}

      <Button variant="primary" type="submit">
        {isEdit ? "Save changes" : "Post thread"}
      </Button>
    </form>
  );

  return (
    <Drawer
      trigger={triggerEl}
      title={isEdit ? "Edit thread" : "New thread"}
      description={
        isEdit ? "Update this thread's details." : "Start a conversation in one of the boards."
      }
      body={body}
      defaultOpen={defaultOpen}
    />
  );
}
