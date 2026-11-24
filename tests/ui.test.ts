import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { cn } from "../src/lib/utils";
import {
  FormSelect,
  DatePicker,
  timeOptions,
} from "../src/components/form-controls";

test("shared controls keep typography roles, 30-minute intervals and server-rendered selection", () => {
  assert.equal(cn("type-body-md", "type-label-sm"), "type-label-sm");
  assert.equal(cn("type-heading-lg", "type-display-md"), "type-display-md");
  assert.equal(
    cn("type-body-md", "type-room-sign", "md:type-building-sign"),
    "type-room-sign md:type-building-sign",
  );
  assert.equal(timeOptions.length, 48);
  assert(
    timeOptions.every(
      (option, i) =>
        option.value ===
        `${String(Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"}`,
    ),
  );
  const html = renderToString(
    createElement(FormSelect, {
      id: "time",
      name: "start",
      defaultValue: "09:30",
      options: timeOptions,
    }),
  );
  assert.match(html, /data-slot="select-value"[^>]*>09:30<\/span>/);
  const date = renderToString(
    createElement(DatePicker, {
      id: "date",
      name: "date",
      defaultValue: "2026-10-28",
    }),
  );
  assert.match(date, /name="date" value="2026-10-28"/);
});
