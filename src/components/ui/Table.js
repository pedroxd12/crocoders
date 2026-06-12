// Tabla genérica. Soporta DOS contratos de columna por compatibilidad histórica:
//  - encabezado: `header` o `label`
//  - valor de celda: `render(row, index)` o, si no hay render, el campo `accessor` o `key`
// Así funcionan tanto las páginas que usan {header, accessor} como las que usan
// {label, key} (p.ej. /admin/programas), que antes mostraban celdas vacías.
//
// Responsive: en escritorio (md+) se renderiza la tabla nativa de siempre — el
// markup y las clases son idénticos al original, así que el diseño de PC no
// cambia. En móvil (< md) la tabla nativa se oculta y cada fila se muestra como
// una tarjeta apilada "Etiqueta: valor", de modo que ninguna columna (incluidas
// las de Acciones) quede cortada fuera de pantalla.
export default function Table({
  columns,
  data,
  emptyMessage = 'No hay datos disponibles',
  className = '',
  headerClassName = '',
  rowClassName = '',
}) {
  const getHeader = (col) => col.header ?? col.label ?? '';
  const getField = (col) => col.accessor ?? col.key;
  const renderCell = (col, row, index) => {
    if (typeof col.render === 'function') return col.render(row, index);
    const field = getField(col);
    return field != null ? row[field] : null;
  };

  const hasData = data && data.length > 0;

  return (
    <>
      {/* Escritorio (md+): tabla nativa — idéntica al diseño original */}
      <div className="hidden md:block overflow-x-auto">
        <table className={`min-w-full bg-gray-700 rounded-lg overflow-hidden ${className}`}>
          <thead className={`bg-gray-600 ${headerClassName}`}>
            <tr>
              {columns.map((column, index) => (
                <th key={index} className={`py-3 px-4 text-left ${column.headerClassName || ''}`}>
                  {getHeader(column)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-600">
            {hasData ? (
              data.map((item, rowIndex) => (
                <tr key={rowIndex} className={rowClassName}>
                  {columns.map((column, colIndex) => (
                    <td key={colIndex} className={`py-3 px-4 ${column.cellClassName || ''}`}>
                      {renderCell(column, item, rowIndex)}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={columns.length} className="py-4 text-center text-gray-400">
                  {emptyMessage}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Móvil (< md): cada fila como tarjeta apilada de pares Etiqueta/valor */}
      <div className="md:hidden space-y-3">
        {hasData ? (
          data.map((item, rowIndex) => (
            <div
              key={rowIndex}
              className="bg-gray-700 rounded-lg p-4 divide-y divide-gray-600/60"
            >
              {columns.map((column, colIndex) => {
                const header = getHeader(column);
                return (
                  <div
                    key={colIndex}
                    className="flex justify-between items-start gap-3 py-2 first:pt-0 last:pb-0"
                  >
                    {header ? (
                      <span className="text-xs font-semibold uppercase tracking-wide text-gray-400 shrink-0 max-w-[40%]">
                        {header}
                      </span>
                    ) : null}
                    <div className={`text-sm break-words ${header ? 'flex-1 min-w-0 text-right' : 'w-full text-left'}`}>
                      {renderCell(column, item, rowIndex)}
                    </div>
                  </div>
                );
              })}
            </div>
          ))
        ) : (
          <div className="bg-gray-700 rounded-lg py-6 text-center text-gray-400">
            {emptyMessage}
          </div>
        )}
      </div>
    </>
  );
}
