export default function Table({ columns, data, emptyMessage = 'No hay datos disponibles' }) {
    return (
      <div className="overflow-x-auto">
        <table className="min-w-full bg-gray-700 rounded-lg overflow-hidden">
          <thead className="bg-gray-600">
            <tr>
              {columns.map((column, index) => (
                <th key={index} className="py-3 px-4 text-left">
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-600">
            {data.length > 0 ? (
              data.map((item, rowIndex) => (
                <tr key={rowIndex}>
                  {columns.map((column, colIndex) => (
                    <td key={colIndex} className="py-3 px-4">
                      {column.render ? column.render(item) : item[column.accessor]}
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
    );
  }