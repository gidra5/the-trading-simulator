import clsx from "clsx";
import { ChevronDown } from "lucide-solid";
import { createSignal, type JSX } from "solid-js";

type CollapseProps = {
  children: JSX.Element;
  class?: string;
  title: JSX.Element;
  open?: boolean;
};

export function Collapse(props: CollapseProps) {
  const [open, setOpen] = createSignal(props.open ?? false);

  return (
    <section class={clsx("overflow-hidden rounded", props.class)}>
      <button
        aria-expanded={open()}
        class={clsx(
          "flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition hover:bg-black-high/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-primary",
        )}
        type="button"
        onClick={() => setOpen((open) => !open)}
      >
        <span class="font-title-primary-sm-rg text-text-primary min-w-0 truncate">{props.title}</span>
        <ChevronDown
          aria-hidden="true"
          class={clsx("h-4 w-4 shrink-0 text-text-secondary transition-transform", open() && "rotate-180")}
          strokeWidth={1.8}
        />
      </button>

      <div
        aria-hidden={!open()}
        class="grid overflow-hidden"
        role="region"
        style={{
          "grid-template-rows": open() ? "1fr" : "0fr",
          opacity: open() ? "1" : "0",
          transition: open()
            ? "grid-template-rows 180ms ease, opacity 140ms ease"
            : "grid-template-rows 180ms ease, opacity 140ms ease, visibility 0s linear 180ms",
          visibility: open() ? "visible" : "hidden",
        }}
      >
        <div class="min-h-0 overflow-hidden px-3 py-2">{props.children}</div>
      </div>
    </section>
  );
}
