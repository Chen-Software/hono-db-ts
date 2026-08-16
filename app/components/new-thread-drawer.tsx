import { css } from "../design-system/css";
import { Button } from "./ui/button";
import { Drawer } from "./ui/drawer";

type NewThreadDrawerProps = {
  boards: { id: string; name: string }[];
  defaultOpen?: boolean;
};

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
 * "New thread" entry point — a button that opens a Drawer containing the create
 * form. The form posts back to `/` with `action=create` (handled by the home
 * route's `POST`), so it stays a native no-JS submit. `defaultOpen` lets a page
 * open the drawer on load (e.g. when arriving with `?compose=1`).
 */
export function NewThreadDrawer({ boards, defaultOpen = false }: NewThreadDrawerProps) {
  const trigger = (
    <Button variant="primary" type="button">
      New thread
    </Button>
  );

  const body = (
    <form method="post" action="/" class={css({ spaceY: 3 })}>
      <input type="hidden" name="action" value="create" />
      <input
        name="title"
        placeholder="Thread title…"
        required
        maxLength={300}
        class={fieldCss}
      />
      <select name="boardId" required class={fieldCss}>
        <option value="">Board…</option>
        {boards.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </select>
      <Button variant="primary" type="submit">
        Post thread
      </Button>
    </form>
  );

  return (
    <Drawer
      trigger={trigger}
      title="New thread"
      description="Start a conversation in one of the boards."
      body={body}
      defaultOpen={defaultOpen}
    />
  );
}
