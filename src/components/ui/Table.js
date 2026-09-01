'use client';

import { TableSkeleton } from './Skeleton';

/**
 * Tabla de datos.
 *
 * Contrato de columna (se mantienen los dos históricos por compatibilidad):
 *   encabezado → `header` o `label`
 *   celda      → `render(row, index)`; si no hay render, el campo `accessor` o `key`
 *   opcional   → `align: 'left' | 'center' | 'right'`, `headerClassName`, `cellClassName`
 *
 * Cambios de diseño respecto a la versión anterior:
 *  - Pintaba la tabla `bg-gray-700`, MÁS CLARA que la tarjeta `bg-gray-800` que
 *    la contenía: la elevación iba al revés. Ahora la tabla es la superficie y
 *    sólo la cabecera se separa, así que no hay que envolverla en otra tarjeta.
 *  - Las filas medían `py-3` con contenido de 48px, dejando la tabla muy suelta.
 *  - `emptyMessage` admitía string o JSX y competía con su propio estilo por
 *    defecto: ahora acepta también un nodo ya compuesto (EmptyState).
 *
 * En móvil (<md) cada fila se apila como tarjeta "Etiqueta: valor" para que
 * ninguna columna quede cortada fuera de pantalla.
 */
export default function Table({
  columns,
  data,
  emptyMessage = 'No hay datos disponibles',
  loading = false,
  className = '',
  headerClassName = '',
  rowClassName = '',
  getRowKey,
}) {
  if (loading) return <TableSkeleton rows={5} cols={columns.length} />;

  const getHeader = (col) => col.header ?? col.label ?? '';
  const getField = (col) => col.accessor ?? col.key;
  const renderCell = (col, row, index) => {
    if (typeof col.render === 'function') return col.render(row, index);
    const field = getField(col);
    return field != null ? row[field] : null;
  };
  const alignClass = (col) =>
    col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left';

  const hasData = Array.isArray(data) && data.length > 0;
  const keyOf = (row, i) => (getRowKey ? getRowKey(row, i) : i);

  return (
    <>
      {/* Escritorio */}
      <div className={`hidden md:block overflow-x-auto rounded-xl border border-line bg-surface ${className}`}>
        <table className="min-w-full border-collapse">
          <thead className={`bg-surface-2 ${headerClassName}`}>
            <tr>
              {columns.map((column, index) => (
                <th
                  key={index}
                  scope="col"
                  className={`whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted ${alignClass(column)} ${column.headerClassName || ''}`}
                >
                  {getHeader(column)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {hasData ? (
              data.map((item, rowIndex) => (
                <tr
                  key={keyOf(item, rowIndex)}
                  className={`border-t border-line transition-colors hover:bg-surface-2/60 ${rowClassName}`}
                >
                  {columns.map((column, colIndex) => (
                    <td
                      key={colIndex}
                      className={`px-4 py-3 text-sm text-fg align-middle ${alignClass(column)} ${column.cellClassName || ''}`}
                    >
                      {renderCell(column, item, rowIndex)}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={columns.length} className="border-t border-line p-0">
                  {typeof emptyMessage === 'string' ? (
                    <p className="px-4 py-10 text-center text-sm text-muted">{emptyMessage}</p>
                  ) : (
                    emptyMessage
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Móvil */}
      <div className="md:hidden space-y-3">
        {hasData ? (
          data.map((item, rowIndex) => (
            <div key={keyOf(item, rowIndex)} className="rounded-xl border border-line bg-surface p-4">
              {columns.map((column, colIndex) => {
                const header = getHeader(column);
                return (
                  <div
                    key={colIndex}
                    className="flex items-start justify-between gap-3 border-b border-line py-2 first:pt-0 last:border-0 last:pb-0"
                  >
                    {header ? (
                      <span className="shrink-0 max-w-[40%] text-xs font-medium uppercase tracking-wide text-faint">
                        {header}
                      </span>
                    ) : null}
                    <div className={`text-sm text-fg ${header ? 'min-w-0 flex-1 text-right' : 'w-full'}`}>
                      {renderCell(column, item, rowIndex)}
                    </div>
                  </div>
                );
              })}
            </div>
          ))
        ) : (
          <div className="rounded-xl border border-line bg-surface">
            {typeof emptyMessage === 'string' ? (
              <p className="px-4 py-10 text-center text-sm text-muted">{emptyMessage}</p>
            ) : (
              emptyMessage
            )}
          </div>
        )}
      </div>
    </>
  );
}
