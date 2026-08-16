import { css } from "../../design-system/css";
import type { JSX } from "hono/jsx";
import { Button } from "./ui/button";
import { Drawer } from "./ui/drawer";

/** Data for editing an existing repository (omitted for create mode). */
export type RepositoryDraft = {
  id: string;
  name: string;
  lowerName: string;
  description: string;
  isPrivate: boolean;
};

type User = { id: string; name: string; email: string };

type RepositoryDrawerProps = {
  /** When provided, the drawer opens in edit mode, prefilled from this repo. */
  repository?: RepositoryDraft;
  defaultOpen?: boolean;
  /** Override the trigger element (defaults to a "New repository" button). */
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
 * Repository editor rendered in a Drawer. Shared by "new" (no `repository` prop)
 * and "edit" (a `repository` prop) flows — same fields, differing only in the
 * submit target and `action` value. The form is a native no-JS submit:
 *   - create → POST `/repositories` with `action=create`
 *   - edit   → POST `/repositories/:id/edit` with `action=save`
 *
 * On create the owning user is the signed-in session (resolved server-side),
 * so the create form needs no owner picker.
 */
export function RepositoryDrawer({
  repository,
  defaultOpen = false,
  trigger,
}: RepositoryDrawerProps) {
  const isEdit = Boolean(repository);
  const formAction = repository ? `/repositories/${repository.id}/edit` : "/repositories";
  const actionValue = repository ? "save" : "create";

  const triggerEl = trigger ?? (
    <Button variant="primary" type="button">
      New repository
    </Button>
  );

  const body = (
    <form method="post" action={formAction} class={css({ spaceY: 3 })}>
      <input type="hidden" name="action" value={actionValue} />

      <div>
        <label class={labelCss}>Name</label>
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
          <span class={css({ fontSize: "sm", color: "faint" })}>~/</span>
          <input
            name="name"
            required
            maxLength={255}
            defaultValue={repository?.name ?? ""}
            class={css({ w: "full", py: 2, border: "none", fontSize: "sm", outline: "none", bg: "transparent" })}
          />
        </div>
        <p class={css({ mt: 1, fontSize: "xs", color: "faint" })}>
          The repository name. URL-safe slug is derived automatically on create.
        </p>
      </div>

      {isEdit ? (
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
            <span class={css({ fontSize: "sm", color: "faint" })}>~/</span>
            <input
              name="lowerName"
              required
              maxLength={255}
              defaultValue={repository?.lowerName ?? ""}
              class={css({ w: "full", py: 2, border: "none", fontSize: "sm", outline: "none", bg: "transparent" })}
            />
          </div>
        </div>
      ) : null}

      <div>
        <label class={labelCss}>Description</label>
        <textarea
          name="description"
          rows={4}
          maxLength={1000}
          defaultValue={repository?.description ?? ""}
          class={css({ ...fieldCss, resize: "vertical" })}
        />
      </div>

      <label class={css({ display: "flex", alignItems: "center", gap: 2, fontSize: "sm", cursor: "pointer" })}>
        <input
          type="checkbox"
          name="isPrivate"
          value="1"
          checked={repository?.isPrivate ?? false}
          class={css({ accentColor: "accent" })}
        />
        Private (only you can see it)
      </label>

      <Button variant="primary" type="submit">
        {isEdit ? "Save changes" : "Create repository"}
      </Button>
    </form>
  );

  return (
    <Drawer
      trigger={triggerEl}
      title={isEdit ? "Edit repository" : "New repository"}
      description={isEdit ? "Update this repository's details." : "Create a new Git repository."}
      body={body}
      defaultOpen={defaultOpen}
    />
  );
}
