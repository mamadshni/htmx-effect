const styles = new CSSStyleSheet();
styles.replaceSync(`
  ds-search { display: block; }
  ds-search input {
    box-sizing: border-box;
    width: 100%;
    padding: 0.5rem;
    font: inherit;
  }
  ds-search [role="listbox"] {
    list-style: none;
    margin: 0.25rem 0 0;
    padding: 0;
    max-height: 15rem;
    overflow-y: auto;
    border: 1px solid #ccc;
    border-radius: 4px;
  }
  ds-search [role="listbox"]:empty,
  ds-search [role="listbox"][hidden] { display: none; }
  ds-search [role="option"] {
    padding: 0.4rem 0.6rem;
    cursor: pointer;
  }
  ds-search [role="option"]:hover { background: #f2f2f2; }
  ds-search [role="option"][aria-selected="true"] {
    background: #2563eb;
    color: #fff;
  }
`);

export class DsSearch extends HTMLElement {
  #input = document.createElement("input");
  #open = false;

  connectedCallback() {
    if (this.#input.isConnected) return;

    if (!document.adoptedStyleSheets.includes(styles)) {
      document.adoptedStyleSheets = [...document.adoptedStyleSheets, styles];
    }

    const input = this.#input;
    input.type = "text";
    input.name = this.getAttribute("name") ?? "q";
    input.autocomplete = "off";
    input.setAttribute("role", "combobox");
    input.setAttribute("aria-autocomplete", "list");
    this.prepend(input);

    input.addEventListener("keydown", (event) => this.#onKeyDown(event));
    input.addEventListener("focus", () => this.#setOpen(true));
    input.addEventListener("input", () => this.#setOpen(true));

    this.addEventListener("focusout", (event) => {
      if (!this.contains(event.relatedTarget as Node | null)) this.#setOpen(false);
    });

    // keep focus in the input so clicking an option does not blur and close the list first
    this.addEventListener("mousedown", (event) => {
      if ((event.target as Element).closest('[role="listbox"]')) {
        event.preventDefault();
      }
    });

    this.addEventListener("click", (event) => {
      const option = (event.target as Element).closest('[role="option"]');
      if (option) this.#select(option);
    });

    // the listbox is swapped in from outside (e.g. htmx), so keep ARIA state in sync
    new MutationObserver(() => this.#sync()).observe(this, {
      childList: true,
      subtree: true,
    });
    this.#sync();
  }

  get #listbox() {
    return this.querySelector<HTMLElement>('[role="listbox"]');
  }

  get #options() {
    return Array.from(
      this.#listbox?.querySelectorAll<HTMLElement>('[role="option"]') ?? [],
    );
  }

  #sync() {
    const listbox = this.#listbox;
    const options = this.#options;

    const expanded = this.#open && options.length > 0;

    if (listbox) {
      listbox.hidden = !expanded;
      if (listbox.id) this.#input.setAttribute("aria-controls", listbox.id);
    }
    this.#input.setAttribute("aria-expanded", String(expanded));

    options.forEach((option, i) => {
      option.id ||= `${listbox?.id || "ds-search"}-option-${i}`;
    });

    if (!expanded) {
      for (const o of options) o.removeAttribute("aria-selected");
    }
    if (!options.some((o) => o.getAttribute("aria-selected") === "true")) {
      this.#input.removeAttribute("aria-activedescendant");
    }
  }

  #setOpen(open: boolean) {
    this.#open = open;
    this.#sync();
  }

  #onKeyDown(event: KeyboardEvent) {
    const options = this.#options;
    if (options.length === 0) return;

    if (!this.#open) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        this.#setOpen(true);
      }
      return;
    }

    const current = options.findIndex(
      (o) => o.getAttribute("aria-selected") === "true",
    );

    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        this.#activate(options[(current + 1) % options.length]);
        break;
      case "ArrowUp":
        event.preventDefault();
        this.#activate(options[current <= 0 ? options.length - 1 : current - 1]);
        break;
      case "Enter":
        if (current < 0) return;
        event.preventDefault();
        this.#select(options[current]);
        break;
      case "Escape":
        // close the list first; a second Escape bubbles up (e.g. closes a dialog)
        event.preventDefault();
        this.#setOpen(false);
        break;
    }
  }

  #activate(option: HTMLElement | undefined) {
    if (!option) return;
    for (const o of this.#options) {
      o.setAttribute("aria-selected", String(o === option));
    }
    this.#input.setAttribute("aria-activedescendant", option.id);
    option.scrollIntoView({ block: "nearest" });
  }

  #select(option: Element) {
    this.#input.value = option.textContent ?? "";
    this.#setOpen(false);
    this.#input.focus();
  }
}

if (!customElements.get("ds-search")) {
  customElements.define("ds-search", DsSearch);
}
