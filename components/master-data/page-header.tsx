export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex justify-between items-start mb-4">
      <div>
        <h2 className="text-lg font-semibold text-navy">{title}</h2>
        {description && <p className="text-xs text-gray-500 mt-1 max-w-2xl">{description}</p>}
      </div>
      {action}
    </div>
  );
}
