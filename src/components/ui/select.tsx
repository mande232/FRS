"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Native <select> compound API (Select / Trigger / Value / Content / Item).
 * Avoids Radix Select — React 19 + Radix composeRefs causes max update depth on <button>.
 */

type SelectItemDesc = {
  value: string;
  label: React.ReactNode;
  disabled?: boolean;
};

type SelectRootProps = {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  disabled?: boolean;
  children?: React.ReactNode;
  name?: string;
};

function isElementOfType(child: React.ReactNode, type: React.ElementType) {
  return React.isValidElement(child) && child.type === type;
}

function SelectTrigger(_props: {
  className?: string;
  children?: React.ReactNode;
  id?: string;
}) {
  return null;
}
SelectTrigger.displayName = "SelectTrigger";

function SelectValue(_props: { placeholder?: string; className?: string }) {
  return null;
}
SelectValue.displayName = "SelectValue";

function SelectContent(_props: { className?: string; children?: React.ReactNode; position?: string }) {
  return null;
}
SelectContent.displayName = "SelectContent";

function SelectItem(_props: {
  value: string;
  children?: React.ReactNode;
  disabled?: boolean;
  className?: string;
  textValue?: string;
}) {
  return null;
}
SelectItem.displayName = "SelectItem";

function SelectGroup({ children }: { children?: React.ReactNode }) {
  return <>{children}</>;
}
SelectGroup.displayName = "SelectGroup";

function SelectLabel(_props: { className?: string; children?: React.ReactNode }) {
  return null;
}
SelectLabel.displayName = "SelectLabel";

function SelectSeparator(_props: { className?: string }) {
  return null;
}
SelectSeparator.displayName = "SelectSeparator";

function collectItems(node: React.ReactNode, into: SelectItemDesc[]) {
  React.Children.forEach(node, (child) => {
    if (!React.isValidElement(child)) return;
    if (child.type === SelectItem) {
      const props = child.props as {
        value: string;
        children?: React.ReactNode;
        disabled?: boolean;
      };
      into.push({
        value: String(props.value),
        label: props.children,
        disabled: props.disabled,
      });
      return;
    }
    if (child.type === SelectGroup || child.type === SelectContent) {
      collectItems((child.props as { children?: React.ReactNode }).children, into);
      return;
    }
    const nested = (child.props as { children?: React.ReactNode } | undefined)?.children;
    if (nested) collectItems(nested, into);
  });
}

function findTriggerMeta(children: React.ReactNode): {
  className?: string;
  placeholder?: string;
  id?: string;
} {
  let className: string | undefined;
  let placeholder: string | undefined;
  let id: string | undefined;
  React.Children.forEach(children, (child) => {
    if (!isElementOfType(child, SelectTrigger) || !React.isValidElement(child)) return;
    const props = child.props as {
      className?: string;
      id?: string;
      children?: React.ReactNode;
    };
    className = props.className;
    id = props.id;
    React.Children.forEach(props.children, (inner) => {
      if (!isElementOfType(inner, SelectValue) || !React.isValidElement(inner)) return;
      placeholder = (inner.props as { placeholder?: string }).placeholder;
    });
  });
  return { className, placeholder, id };
}

function Select({
  value,
  defaultValue,
  onValueChange,
  disabled,
  children,
  name,
}: SelectRootProps) {
  const items: SelectItemDesc[] = [];
  collectItems(children, items);
  const trigger = findTriggerMeta(children);
  const isControlled = value !== undefined;
  const [uncontrolled, setUncontrolled] = React.useState(defaultValue ?? "");
  const current = isControlled ? value ?? "" : uncontrolled;

  return (
    <div className="relative w-full">
      <select
        id={trigger.id}
        name={name}
        disabled={disabled}
        value={current}
        onChange={(event) => {
          const next = event.target.value;
          if (!isControlled) setUncontrolled(next);
          onValueChange?.(next);
        }}
        className={cn(
          "flex h-9 w-full appearance-none items-center justify-between whitespace-nowrap rounded-md border border-input bg-transparent py-2 pl-3 pr-9 text-sm shadow-sm ring-offset-background cursor-pointer focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
          trigger.className,
        )}
      >
        {trigger.placeholder ? (
          <option value="" disabled={current !== ""}>
            {trigger.placeholder}
          </option>
        ) : null}
        {items.map((item) => (
          <option key={item.value} value={item.value} disabled={item.disabled}>
            {typeof item.label === "string" || typeof item.label === "number"
              ? item.label
              : item.value}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 opacity-50" />
    </div>
  );
}
Select.displayName = "Select";

const SelectScrollUpButton = (_props: { className?: string }) => null;
const SelectScrollDownButton = (_props: { className?: string }) => null;

export {
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectLabel,
  SelectItem,
  SelectSeparator,
  SelectScrollUpButton,
  SelectScrollDownButton,
};
