import { css } from "../../design-system/css";
import type { JSX } from "hono/jsx";
import { Button } from "./ui/button";
import { Drawer } from "./ui/drawer";

/** Data for editing an existing board (omitted for create mode). */
export type BoardDraft = {
  id: string;
  name: string;
  slug: string;
  description: string;
  moderatorId: string;
};

type User = { id: string; name: string; email: string };

type BoardDrawerProps = {
  users: User[];
  /** When provided, the drawer opens in edit mode, prefilled from this board. */
  board?: BoardDraft;
  defaultOpen?: boolean;
  /** Override the trigger element (defaults to a "New board" button). */
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
 * Board editor rendered in a Drawer. Shared by "new" (no `board` prop) and
 * "edit" (a `board` prop) flows — same fields, differing only in the submit
 * target and `action` value. The form is a native no-JS submit:
 *   - create → POST `/boards` with `action=create`
 *   - edit   → POST `/boards/:id/edit` with `action=save`
 */
export function BoardDrawer({ users, board, defaultOpen = false, trigger }: BoardDrawerProps) {
  const isEdit = Boolean(board);
  const formAction = board ? `/boards/${board.id}/edit` : "/boards";
  const actionValue = board ? "save" : "create";

  const triggerEl = trigger ?? (
    <Button variant="primary" type="button">
      New board
    </Button>
  );

  const body = (
    <form method="post" action={formAction} class={css({ spaceY: 3 })}>
      <input type="hidden" name="action" value={actionValue} />

      <div>
        <label class={labelCss}>Name</label>
        <input name="name" required maxLength={80} defaultValue={board?.name ?? ""} class={fieldCss} />
      </div>

      <div>
        <label class={labelCss}>Slug</label>
        <div
          class={css({
            display: "flex",
            alignItems: "center",
            gap: 2,
            rounded: "md",
            border: "1px solid token(colors.border)",
            px: 3,
            _focusWithin: { borderColor: "accent" },
          })}
        >
          <span class={css({ fontSize: "sm", color: "faint" })}>/</span>
          <input
            name="slug"
            required
            maxLength={80}
            defaultValue={board?.slug ?? ""}
            class={css({ w: "full", py: 2, border: "none", fontSize: "sm", outline: "none", bg: "transparent" })}
          />
        </div>
        <p class={css({ mt: 1, fontSize: "xs", color: "faint" })}>URL-safe identifier (must be unique).</p>
      </div>

      <div>
        <label class={labelCss}>Description</label>
        <textarea
          name="description"
          rows={4}
          maxLength={500}
          defaultValue={board?.description ?? ""}
          class={css({ ...fieldCss, resize: "vertical" })}
        />
      </div>

      <div>
        <label class={labelCss}>Moderator</label>
        <select name="moderatorId" required class={fieldCss}>
          <option value="">Select moderator…</option>
          {users.map((u) => (
            <option key={u.id} value={u.id} selected={u.id === board?.moderatorId}>
              {u.name} ({u.email})
            </option>
          ))}
        </select>
      </div>

      <Button variant="primary" type="submit">
        {isEdit ? "Save changes" : "Create board"}
      </Button>
    </form>
  );

  return (
    <Drawer
      trigger={triggerEl}
      title={isEdit ? "Edit board" : "New board"}
      description={isEdit ? "Update this board's details." : "Create a new community board."}
      body={body}
      defaultOpen={defaultOpen}
    />
  );
}
