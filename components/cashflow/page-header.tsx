export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) {
  return (
    <div className="border-b border-border bg-white px-8 py-5 flex items-start justify-between">
      <div>
        <h1 className="text-lg font-bold text-navy">{title}</h1>
        {description && <p className="text-xs text-gray-500 mt-0.5">{description}</p>}
      </div>
      {actions}
    </div>
  );
}
