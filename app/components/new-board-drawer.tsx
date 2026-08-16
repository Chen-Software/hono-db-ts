import { css } from "../design-system/css";
import { Button } from "./ui/button";
import { Drawer } from "./ui/drawer";

type User = { id: string; name: string; email: string };

type NewBoardDrawerProps = {
  users: User[];
  /** Pre-selects the moderator (defaults to the current session user). */
  defaultModeratorId?: string;
  defaultOpen?: boolean;
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
 * "New board" entry point — a button that opens a Drawer containing the create
 * form. The form posts back to `/boards` with `action=create` (handled by the
 * boards route's `POST`), so it stays a native no-JS submit. `defaultOpen`
 * lets a page open the drawer on load (e.g. when arriving with `?new=1`).
 */
export function NewBoardDrawer({ users, defaultModeratorId, defaultOpen = false }: NewBoardDrawerProps) {
  const trigger = (
    <Button variant="primary" type="button">
      New board
    </Button>
  );

  const body = (
    <form method="post" action="/boards" class={css({ spaceY: 3 })}>
      <input type="hidden" name="action" value="create" />

      <div>
        <label class={labelCss}>Name</label>
        <input name="name" required maxLength={80} class={fieldCss} />
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
          class={css({ ...fieldCss, resize: "vertical" })}
        />
      </div>

      <div>
        <label class={labelCss}>Moderator</label>
        <select name="moderatorId" required class={fieldCss}>
          <option value="">Select moderator…</option>
          {users.map((u) => (
            <option key={u.id} value={u.id} selected={u.id === defaultModeratorId}>
              {u.name} ({u.email})
            </option>
          ))}
        </select>
      </div>

      <Button variant="primary" type="submit">
        Create board
      </Button>
    </form>
  );

  return (
    <Drawer
      trigger={trigger}
      title="New board"
      description="Create a new community board."
      body={body}
      defaultOpen={defaultOpen}
    />
  );
}
