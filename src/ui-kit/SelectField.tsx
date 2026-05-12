import { For, type Component } from "solid-js";
import { Field } from "./Field";

type SelectOption = {
  label: string;
  value: string;
};

type SelectFieldProps = {
  class?: string;
  label: string;
  onChange: (value: string) => void;
  options: readonly SelectOption[];
  value: string;
};

export const SelectField: Component<SelectFieldProps> = (props) => (
  <Field class={props.class} label={props.label}>
    <select
      class="body-primary-sm-rg h-9 rounded border border-border bg-surface-primary px-2.5 outline-none transition focus:border-accent-primary"
      value={props.value}
      onChange={(event) => props.onChange(event.currentTarget.value)}
    >
      <For each={props.options}>{(option) => <option value={option.value}>{option.label}</option>}</For>
    </select>
  </Field>
);
