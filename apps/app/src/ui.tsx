/** Small layout pieces shared by the modules. */

export const Section = ({
  id,
  title,
  lang,
  children,
}: {
  id: string;
  title: string;
  lang?: string;
  children?: JSX.Node;
}) => (
  <section class="card" lang={lang} aria-labelledby={`${id}-title`}>
    <h2 id={`${id}-title`} class="card__title">
      {title}
    </h2>
    {children}
  </section>
);

export const Field = ({ id, label, children }: { id: string; label: string; children?: JSX.Node }) => (
  <div class="field">
    <label for={id} class="field__label">
      {label}
    </label>
    {children}
  </div>
);
