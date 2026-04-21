# Design System Specification: The Observational Monolith

## 1. Overview & Creative North Star
**Creative North Star: The Observational Monolith**

This design system rejects the "friendly" ubiquity of modern SaaS. It is an instrument, not an app. It views the user not as a consumer to be engaged, but as a subject to be measured and a researcher to be informed. The aesthetic is driven by the cold precision of laboratory hardware and mid-century brutalist technical manuals. 

To break the "template" look, we move away from centered, balanced layouts in favor of **Intentional Asymmetry**. Large blocks of data may be weighted to the left, balanced only by a single high-precision technical label on the far right. We utilize "The Void"—expansive use of `#131313`—to create a sense of calm and focus, ensuring that when data does appear, it carries the weight of objective truth.

---

## 2. Colors & Surface Hierarchy
The palette is rooted in the absence of light, utilizing high-performance cool tones to guide the eye toward clinical significance.

- **Primary (`#bac3ff`):** The "Active Pulse." Used exclusively for focus states, primary actions, and confirmed data points.
- **Secondary (`#b1cad7`):** The "Metadata." Used for secondary labels and non-essential structural elements.
- **Tertiary/Amber (`#ffba38`):** The "Uncertainty State." Use this token for provisional data, fluctuating metrics, or "In Progress" cognitive states. It is a warning of incompleteness, not a failure.
- **Surface Tiers:** 
    - **Base:** `surface` (#131313) is the vacuum.
    - **Nesting:** Use `surface-container-low` (#1c1b1b) for large content areas and `surface-container-high` (#2a2a2a) for nested data modules.

**The "No-Line" Rule:**
Prohibit 1px solid borders for general layout sectioning. Boundaries must be defined through **Background Color Shifts**. A data module should sit as a `surface-container-high` block against a `surface` background. The transition should be sharp and immediate.

**Signature Textures:**
While the UI is austere, it is not flat. Use a subtle linear gradient on primary action buttons—transitioning from `primary` to `primary_container`—to give the impression of a backlit physical button on a console.

---

## 3. Typography
The typography strategy creates a dual-language system: **Technical vs. Humanist.**

- **Technical Data (Monospace):** All numerical values, tabular data, and technical labels must use a high-precision monospace font (JetBrains Mono or SF Mono). This suggests the data is being pulled directly from a raw instrument feed. Use `label-md` and `label-sm` for these technical tags.
- **Body Prose (Inter):** All descriptive text, instructions, and cognitive prompts use Inter. This provides a necessary humanist bridge for readability, ensuring the user can process complex instructions without fatigue.
- **Display & Headlines (Space Grotesk):** Use `display-lg` through `headline-sm` to create an authoritative, editorial hierarchy. These should be set with tight letter-spacing (-0.02em) to maintain a "scientific journal" density.

---

## 4. Elevation & Depth
Elevation in this system is achieved through **Tonal Layering** rather than light and shadow.

- **The Layering Principle:** Depth is "stacked." Place `surface-container-lowest` cards on a `surface-container-low` section to create a "recessed" effect, suggesting the UI is carved out of a solid block.
- **The Zero-Shadow Mandate:** Standard drop shadows are strictly forbidden. They imply a light source that doesn't exist in a digital instrument.
- **The "Ghost Border" Fallback:** If a container requires further definition (e.g., in high-density data visualizations), use a "Ghost Border": the `outline-variant` token at 15% opacity. It should be felt, not seen.
- **Glassmorphism:** For floating diagnostic overlays or tooltips, use `surface` at 80% opacity with a `20px` backdrop blur. This creates a "frosted lens" effect, maintaining the scientific metaphor.

---

## 5. Components

### Buttons
- **Shape:** Rigid 0px radius. No exceptions.
- **Primary:** `primary` background with `on_primary` text. No border.
- **Secondary:** `surface-container-highest` background. Sharp edges.
- **Tertiary:** Text-only, using the `primary` color for the label, paired with a monospace "chevron" (e.g., `>`) to indicate direction.

### Data Inputs
- **Text Fields:** Use a `surface-container-low` background with a 1px `outline-variant` bottom-border only. This mimics a physical form.
- **State:** Active inputs use a `primary` 2px bottom-border. Error states use `error` (#ffb4ab).

### Chips & Status Indicators
- **Scientific Chips:** Use `secondary_container` with `on_secondary_container` text. These should be rectangular.
- **Uncertainty Indicator:** A small 4px square of `tertiary` (Amber) next to a data point signifies "Provisional Data."

### Cards & Lists
- **The Divider Rule:** Forbid the use of horizontal rules. Separate list items using `8px` of vertical space or a alternating background shifts between `surface-container-low` and `surface-container-lowest`.

### Progress Gauges
- Avoid circular "loaders." Use horizontal "Linear Data Streams." A thin `primary` bar that fills a `surface-container-highest` track, moving with 0ms easing (stepped animation) to mimic real-time hardware processing.

---

## 6. Do's and Don'ts

**Do:**
- **Do** embrace high information density. The user is an expert.
- **Do** use `0px` border radius on every single element to maintain the "Monolith" aesthetic.
- **Do** use monospace for any value that could be found in a spreadsheet.
- **Do** use intentional asymmetry (e.g., a header aligned to the left with a timestamp aligned to the extreme right).

**Don't:**
- **Don't** use "Soft UI" or "Friendly" language. Use "Commence Assessment" instead of "Let's go!"
- **Don't** use standard drop shadows. If it needs to pop, change the background color.
- **Don't** use rounded corners. A 2px radius is the absolute maximum allowed only for touch-target accessibility on mobile.
- **Don't** use decorative icons. Icons must be functional and technical (e.g., crosshairs, grids, or arrows).