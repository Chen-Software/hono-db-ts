import { cx } from "design-system/css";
import { stack } from "design-system/patterns";
import type { ToastVariantProps } from "design-system/recipes";
import { toast as toastRecipe } from "design-system/recipes";
import type { Child, PropsWithChildren } from "hono/jsx";
import { useEffect, useRef, useState } from "hono/jsx";
import { CloseButton } from "../components/ui/button";
import { whenAnimationEnds } from "../components/ui/overlay-a11y";
import {
	ActionTrigger,
	CloseTrigger,
	Description,
	Indicator,
	type SwipeDirection,
	Title,
	ToastContext,
	type ToastContextValue,
} from "../components/ui/toast-primitive";

export interface RootProps extends ToastVariantProps, PropsWithChildren {
	class?: string;
	type?: string;
	toast?: ToastContextValue["toast"];
	dismiss?: ToastContextValue["dismiss"];
	/**
	 * Direction of pointer swipe that dismisses the toast.
	 * @default "right"
	 */
	swipeDirection?: SwipeDirection;
	/**
	 * Distance in pixels the pointer must travel before a swipe dismisses the toast.
	 * @default 50
	 */
	swipeThreshold?: number;
	/** Receives the underlying DOM node (mount and unmount). */
	rootRef?: (el: HTMLDivElement | null) => void;
	[key: string]: unknown;
}

export function Root(props: RootProps) {
	const [variantProps, localProps] = toastRecipe.splitVariantProps(props);
	const {
		children,
		class: classProp,
		toast,
		dismiss,
		swipeDirection = "right",
		swipeThreshold = 50,
		onKeyDown,
		rootRef: externalRef,
		...rest
	} = localProps as RootProps & {
		onKeyDown?: (e: KeyboardEvent) => void;
	};

	const resolvedType = (variantProps.type as string) || toast?.type || "info";
	const styles = toastRecipe({ ...variantProps, type: resolvedType });
	const nodeRef = useRef<HTMLDivElement | null>(null);

	const setRef = (el: HTMLDivElement | null) => {
		nodeRef.current = el;
		if (typeof externalRef === "function") externalRef(el);
	};

	const handleDismiss = () => {
		if (toast?.id && dismiss) dismiss(toast.id);
	};

	// Swipe-to-dismiss: track the pointer directly on the DOM node and drive
	// the recipe's `--x`/`--y` translate custom properties. Release past
	// `swipeThreshold` plays its own fly-out transition (independent of the
	// `_closed` keyframe, which is reserved for timed/programmatic dismissal)
	// so the exit continues naturally from wherever the drag left off.
	useEffect(() => {
		const node = nodeRef.current;
		if (!node || !dismiss || !toast?.id) return;
		const id = toast.id;
		const axis =
			swipeDirection === "left" || swipeDirection === "right" ? "x" : "y";
		const sign =
			swipeDirection === "right" || swipeDirection === "down" ? 1 : -1;

		let start: { x: number; y: number } | null = null;
		let dragging = false;

		const onPointerDown = (e: PointerEvent) => {
			if (e.button !== 0) return;
			if ((e.target as HTMLElement).closest("button")) return;
			start = { x: e.clientX, y: e.clientY };
		};

		const onPointerMove = (e: PointerEvent) => {
			if (!start) return;
			const dx = e.clientX - start.x;
			const dy = e.clientY - start.y;
			const delta = axis === "x" ? dx : dy;

			if (!dragging) {
				if (Math.abs(delta) < 4 || Math.sign(delta || 1) !== sign) return;
				dragging = true;
				node.setPointerCapture(e.pointerId);
				node.setAttribute("data-swipe", "move");
			}

			const clamped = sign > 0 ? Math.max(0, delta) : Math.min(0, delta);
			node.style.setProperty("--x", axis === "x" ? `${clamped}px` : "0");
			node.style.setProperty("--y", axis === "y" ? `${clamped}px` : "0");
		};

		const endDrag = (e: PointerEvent) => {
			if (!dragging) {
				start = null;
				return;
			}
			if (node.hasPointerCapture(e.pointerId)) {
				node.releasePointerCapture(e.pointerId);
			}
			const dx = e.clientX - (start?.x ?? e.clientX);
			const dy = e.clientY - (start?.y ?? e.clientY);
			const delta = axis === "x" ? dx : dy;
			dragging = false;
			start = null;

			if (Math.abs(delta) > swipeThreshold) {
				node.setAttribute("data-swipe", "end");
				node.dataset.swipeDismissed = "true";
				node.style.setProperty("--x", axis === "x" ? `${sign * 100}%` : "0");
				node.style.setProperty("--y", axis === "y" ? `${sign * 100}%` : "0");
				node.style.opacity = "0";
				let done = false;
				const finish = () => {
					if (done) return;
					done = true;
					node.removeEventListener("transitionend", finish);
					dismiss(id);
				};
				node.addEventListener("transitionend", finish, { once: true });
				window.setTimeout(finish, 250);
			} else {
				node.setAttribute("data-swipe", "cancel");
				node.style.removeProperty("--x");
				node.style.removeProperty("--y");
			}
		};

		node.addEventListener("pointerdown", onPointerDown);
		node.addEventListener("pointermove", onPointerMove);
		node.addEventListener("pointerup", endDrag);
		node.addEventListener("pointercancel", endDrag);
		return () => {
			node.removeEventListener("pointerdown", onPointerDown);
			node.removeEventListener("pointermove", onPointerMove);
			node.removeEventListener("pointerup", endDrag);
			node.removeEventListener("pointercancel", endDrag);
		};
	}, [dismiss, toast?.id, swipeDirection, swipeThreshold]);

	return (
		<ToastContext.Provider value={{ styles, toast, dismiss }}>
			{/* biome-ignore lint/a11y/noStaticElementInteractions: role/aria-live are computed from `resolvedType` so the linter can't see the element is already an accessible status/alert region; tabIndex+onKeyDown add Escape-to-dismiss on top of that role */}
			<div
				data-scope="toast"
				data-part="root"
				data-type={resolvedType}
				data-state="open"
				data-swipe-direction={swipeDirection}
				role={resolvedType === "error" ? "alert" : "status"}
				aria-live={resolvedType === "error" ? "assertive" : "polite"}
				aria-atomic="true"
				tabIndex={0}
				class={cx(styles.root, classProp)}
				ref={setRef}
				onKeyDown={(e: KeyboardEvent) => {
					onKeyDown?.(e);
					if (e.defaultPrevented) return;
					if (e.key === "Escape") handleDismiss();
				}}
				{...rest}
			>
				{children}
			</div>
		</ToastContext.Provider>
	);
}

type Placement =
	| "top-start"
	| "top"
	| "top-end"
	| "bottom-start"
	| "bottom"
	| "bottom-end";

const getPlacementStyles = (placement: string): Record<string, string> => {
	switch (placement) {
		case "top-start":
			return { top: "1rem", left: "1rem", flexDirection: "column-reverse" };
		case "top":
			return {
				top: "1rem",
				left: "50%",
				transform: "translateX(-50%)",
				flexDirection: "column-reverse",
			};
		case "top-end":
			return { top: "1rem", right: "1rem", flexDirection: "column-reverse" };
		case "bottom-start":
			return { bottom: "1rem", left: "1rem", flexDirection: "column" };
		case "bottom":
			return {
				bottom: "1rem",
				left: "50%",
				transform: "translateX(-50%)",
				flexDirection: "column",
			};
		default:
			return { bottom: "1rem", right: "1rem", flexDirection: "column" };
	}
};

/** Which entrance/exit keyframe pair (top vs bottom) a placement should use. */
const getPlacementGroup = (placement: string): "top" | "bottom" =>
	placement.startsWith("top") ? "top" : "bottom";

/** Default swipe-to-dismiss direction for a placement — toward the screen edge the toast anchors to. */
const getSwipeDirection = (placement: string): SwipeDirection => {
	switch (placement) {
		case "top-start":
		case "bottom-start":
			return "left";
		case "top":
			return "up";
		case "bottom":
			return "down";
		default:
			return "right";
	}
};

interface ToastOptions {
	id: string;
	title?: string;
	description?: string;
	type?: "info" | "success" | "warning" | "error" | "loading";
	duration?: number;
	closable?: boolean;
	action?: {
		label: string;
		onClick: () => void;
	};
}

interface PromiseOptions<T = unknown> {
	loading: Omit<Partial<ToastOptions>, "id" | "type"> & { title?: string };
	success:
		| string
		| ((
				data: T,
		  ) => Omit<Partial<ToastOptions>, "id" | "type"> & { title?: string });
	error:
		| string
		| ((
				err: Error,
		  ) => Omit<Partial<ToastOptions>, "id" | "type"> & { title?: string });
}

interface ToasterProps {
	toaster: ReturnType<typeof createToaster>;
	children?: (toast: ToastOptions) => unknown;
}

function createToaster(
	config: {
		placement?: Placement;
		overlap?: boolean;
		max?: number;
		duration?: number;
		gap?: number;
		removeDelay?: number;
	} = {},
) {
	const placement = config.placement || "bottom-end";
	const overlap = config.overlap ?? false;
	const max = config.max ?? 24;
	const defaultDuration = config.duration ?? 5000;
	const gap = config.gap ?? 16;
	const removeDelay = config.removeDelay ?? 200;

	let toasts: ToastOptions[] = [];
	const listeners = new Set<(toasts: ToastOptions[]) => void>();

	// Auto-dismiss timer bookkeeping, kept separate from `toasts` so a toast's
	// remaining time can be paused (e.g. while the user is hovering or has
	// focus inside the toaster) and resumed without losing track of it.
	const timers = new Map<
		string,
		{
			remaining: number;
			startedAt: number;
			handle: ReturnType<typeof setTimeout> | null;
		}
	>();
	let paused = false;

	const notify = () => {
		for (const listener of listeners) {
			listener([...toasts]);
		}
	};

	const clearTimer = (id: string) => {
		const timer = timers.get(id);
		if (timer?.handle != null) clearTimeout(timer.handle);
		timers.delete(id);
	};

	const scheduleTimer = (id: string, duration: number) => {
		clearTimer(id);
		if (!duration || duration === Infinity) return;
		timers.set(id, {
			remaining: duration,
			startedAt: Date.now(),
			handle: paused ? null : setTimeout(() => dismiss(id), duration),
		});
	};

	const pause = () => {
		if (paused) return;
		paused = true;
		for (const timer of timers.values()) {
			if (timer.handle == null) continue;
			clearTimeout(timer.handle);
			timer.remaining = Math.max(
				0,
				timer.remaining - (Date.now() - timer.startedAt),
			);
			timer.handle = null;
		}
	};

	const resume = () => {
		if (!paused) return;
		paused = false;
		for (const [id, timer] of timers) {
			if (timer.handle != null || timer.remaining <= 0) continue;
			timer.startedAt = Date.now();
			timer.handle = setTimeout(() => dismiss(id), timer.remaining);
		}
	};

	const dismiss = (id?: string) => {
		if (id) {
			toasts = toasts.filter((t) => t.id !== id);
			clearTimer(id);
		} else {
			toasts = [];
			for (const timerId of [...timers.keys()]) clearTimer(timerId);
		}
		notify();

		if (typeof window !== "undefined") {
			window.dispatchEvent(
				new CustomEvent("park-ui:toast:dismissed", { detail: { id } }),
			);
		}
	};

	const create = (options: Partial<ToastOptions> & { title?: string }) => {
		const id = options.id || Math.random().toString(36).substring(2, 9);
		const duration =
			options.duration !== undefined ? options.duration : defaultDuration;

		const toast: ToastOptions = {
			...options,
			id,
			type: options.type || "info",
			duration,
		};

		if (toasts.length >= max) {
			const [oldest] = toasts;
			toasts.shift();
			if (oldest) clearTimer(oldest.id);
		}

		toasts.push(toast);
		notify();
		scheduleTimer(id, duration);

		return id;
	};

	const update = (id: string, options: Partial<ToastOptions>) => {
		toasts = toasts.map((t) => {
			if (t.id === id) {
				return { ...t, ...options };
			}
			return t;
		});
		notify();
		if (options.duration !== undefined) scheduleTimer(id, options.duration);
	};

	const success = (
		titleOrOptions: string | (Partial<ToastOptions> & { title?: string }),
		options?: Partial<ToastOptions>,
	) => {
		if (typeof titleOrOptions === "string") {
			return create({ ...options, title: titleOrOptions, type: "success" });
		}
		return create({ ...titleOrOptions, type: "success" });
	};

	const error = (
		titleOrOptions: string | (Partial<ToastOptions> & { title?: string }),
		options?: Partial<ToastOptions>,
	) => {
		if (typeof titleOrOptions === "string") {
			return create({ ...options, title: titleOrOptions, type: "error" });
		}
		return create({ ...titleOrOptions, type: "error" });
	};

	const warning = (
		titleOrOptions: string | (Partial<ToastOptions> & { title?: string }),
		options?: Partial<ToastOptions>,
	) => {
		if (typeof titleOrOptions === "string") {
			return create({ ...options, title: titleOrOptions, type: "warning" });
		}
		return create({ ...titleOrOptions, type: "warning" });
	};

	const info = (
		titleOrOptions: string | (Partial<ToastOptions> & { title?: string }),
		options?: Partial<ToastOptions>,
	) => {
		if (typeof titleOrOptions === "string") {
			return create({ ...options, title: titleOrOptions, type: "info" });
		}
		return create({ ...titleOrOptions, type: "info" });
	};

	const loading = (
		titleOrOptions: string | (Partial<ToastOptions> & { title?: string }),
		options?: Partial<ToastOptions>,
	) => {
		if (typeof titleOrOptions === "string") {
			return create({
				...options,
				title: titleOrOptions,
				type: "loading",
				duration: 0,
			});
		}
		return create({ ...titleOrOptions, type: "loading", duration: 0 });
	};

	const promise = <T,>(
		prom: Promise<T>,
		options: PromiseOptions<T>,
	): Promise<T> => {
		const id = create({ ...options.loading, type: "loading", duration: 0 });

		prom
			.then((data) => {
				const successOptions =
					typeof options.success === "function"
						? options.success(data)
						: { title: options.success };
				update(id, {
					...successOptions,
					type: "success",
					duration: defaultDuration,
				});
			})
			.catch((err) => {
				const errorOptions =
					typeof options.error === "function"
						? options.error(err)
						: { title: options.error };
				update(id, {
					...errorOptions,
					type: "error",
					duration: defaultDuration,
				});
			});

		return prom;
	};

	const subscribe = (callback: (toasts: ToastOptions[]) => void) => {
		listeners.add(callback);
		callback([...toasts]);
		return () => {
			listeners.delete(callback);
		};
	};

	return {
		placement,
		overlap,
		max,
		gap,
		removeDelay,
		create,
		success,
		error,
		warning,
		info,
		loading,
		promise,
		dismiss,
		update,
		pause,
		resume,
		subscribe,
		getToasts: () => [...toasts],
		getCount: () => toasts.length,
	};
}

const toaster = createToaster({
	placement: "bottom-end",
	overlap: true,
	max: 5,
});

if (typeof window !== "undefined") {
	window.addEventListener("park-ui:toast:create", (e: unknown) => {
		const customEvent = e as CustomEvent;
		if (customEvent.detail) {
			const { id, ...options } = customEvent.detail;
			toaster.create({ ...options, id });
		}
	});
	window.addEventListener("park-ui:toast:dismiss", (e: unknown) => {
		const customEvent = e as CustomEvent;
		if (customEvent.detail) {
			const { id } = customEvent.detail;
			toaster.dismiss(id);
		}
	});
}

export default function Toaster(props: ToasterProps) {
	const activeToaster = props.toaster || toaster;
	const [renderList, setRenderList] = useState<ToastOptions[]>(() =>
		activeToaster.getToasts(),
	);
	// ids whose toast has left the store but is still playing its exit
	// animation, so the DOM node stays mounted long enough to animate out.
	const exitingRef = useRef<Set<string>>(new Set());
	const sectionRef = useRef<HTMLElement | null>(null);

	useEffect(() => {
		return activeToaster.subscribe((newToasts) => {
			setRenderList((prev) => {
				const nextById = new Map(newToasts.map((t) => [t.id, t]));
				const prevIds = new Set(prev.map((t) => t.id));
				const merged: ToastOptions[] = [];
				for (const t of prev) {
					const next = nextById.get(t.id);
					if (next) {
						merged.push(next);
					} else {
						exitingRef.current.add(t.id);
						merged.push(t);
					}
				}
				for (const t of newToasts) {
					if (!prevIds.has(t.id)) merged.push(t);
				}
				return merged;
			});
		});
	}, [activeToaster]);

	// Viewport-level pause: hovering or focusing *any* toast pauses every
	// active auto-dismiss timer so a toast being read never disappears
	// mid-interaction; leaving the whole toaster resumes them.
	useEffect(() => {
		const section = sectionRef.current;
		if (!section) return;

		const pause = () => activeToaster.pause();
		const resume = () => activeToaster.resume();
		const onFocusOut = (e: FocusEvent) => {
			if (!section.contains(e.relatedTarget as Node | null)) resume();
		};

		section.addEventListener("pointerenter", pause);
		section.addEventListener("pointerleave", resume);
		section.addEventListener("focusin", pause);
		section.addEventListener("focusout", onFocusOut);
		return () => {
			section.removeEventListener("pointerenter", pause);
			section.removeEventListener("pointerleave", resume);
			section.removeEventListener("focusin", pause);
			section.removeEventListener("focusout", onFocusOut);
		};
	}, [activeToaster]);

	const placementGroup = getPlacementGroup(activeToaster.placement);
	const swipeDirection = getSwipeDirection(activeToaster.placement);

	return (
		<section
			ref={(el: HTMLElement | null) => {
				sectionRef.current = el;
			}}
			aria-label="Notifications"
			style={{
				position: "fixed",
				display: "flex",
				gap: "0.5rem",
				zIndex: 9999,
				pointerEvents: renderList.length ? undefined : "none",
				maxWidth: "calc(100vw - 2rem)",
				...getPlacementStyles(activeToaster.placement),
			}}
		>
			{renderList.map((toast) => {
				const isExiting = exitingRef.current.has(toast.id);

				const handleRootRef = (el: HTMLDivElement | null) => {
					if (!el || !isExiting || el.dataset.exitScheduled === "true") return;
					el.dataset.exitScheduled = "true";
					if (el.dataset.swipeDismissed === "true") {
						exitingRef.current.delete(toast.id);
						setRenderList((list) => list.filter((t) => t.id !== toast.id));
						return;
					}
					whenAnimationEnds(el, () => {
						exitingRef.current.delete(toast.id);
						setRenderList((list) => list.filter((t) => t.id !== toast.id));
					});
				};

				if (props.children) {
					return props.children(toast);
				}

				return (
					<Root
						key={toast.id}
						rootRef={handleRootRef}
						type={toast.type}
						toast={toast}
						dismiss={activeToaster.dismiss}
						data-state={isExiting ? "closed" : "open"}
						placement={placementGroup}
						swipeDirection={swipeDirection}
						style={{ pointerEvents: "auto" }}
					>
						<Indicator />
						<div class={stack({ gap: "3", alignItems: "start", flex: 1 })}>
							<div class={stack({ gap: "1" })}>
								{toast.title && <Title>{toast.title}</Title>}
								{toast.description && (
									<Description>{toast.description}</Description>
								)}
							</div>
							{toast.action && (
								<ActionTrigger>{toast.action.label}</ActionTrigger>
							)}
						</div>
						{toast.closable && (
							<CloseTrigger>
								<CloseButton size="sm" />
							</CloseTrigger>
						)}
					</Root>
				);
			})}
		</section>
	);
}

export type { PromiseOptions, ToasterProps, ToastOptions };
export { createToaster, toaster };
