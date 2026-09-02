'use client';
import { useId, useState } from 'react';
import { ChevronDown, Filter, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// Clases de los <select> del panel, tomadas del sistema de campos (field.js).
const selectClasses =
  'w-full rounded-lg bg-surface-2 border border-line px-3 py-2.5 text-sm text-fg ' +
  'transition-colors cursor-pointer focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/25';

// El estado (próximos/pasados/todos) sí es un catálogo cerrado: lo calcula la
// propia página, no la base de datos.
const estadosEvento = [
  { value: 'proximos', label: 'Próximos' },
  { value: 'pasados', label: 'Pasados' },
  { value: 'todos', label: 'Todos' }
];

/**
 * `tipos` y `hermandades` llegan derivados de los eventos realmente cargados.
 * Antes eran constantes escritas a mano en minúsculas y comparadas por igualdad
 * estricta contra el nombre del catálogo de la BD: cualquier tipo nuevo (Taller,
 * Hackathon) era imposible de filtrar, y bastaba una mayúscula distinta para
 * que el filtro devolviera la lista vacía.
 */
export default function FilterControls({ filters, onFilterChange, tipos = [], hermandades = [] }) {
  const [isExpanded, setIsExpanded] = useState(false);
  // Ids propios para enlazar cada <label> con su <select>: sin `htmlFor` los
  // tres desplegables se anunciaban como "lista sin etiqueta" y pulsar el texto
  // no daba el foco al control.
  const idBase = useId();

  const opcionesTipo = [{ value: 'todos', label: 'Todos los tipos' }, ...tipos.map(t => ({ value: t, label: t }))];
  const opcionesHermandad = [
    { value: 'todos', label: 'Todas las comunidades' },
    ...hermandades.map(h => ({ value: h, label: h })),
  ];

  // Función para mostrar chips de filtros activos
  const getActiveFilters = () => {
    const active = [];

    if (filters.tipo && filters.tipo !== 'todos') {
      active.push({ type: 'tipo', label: filters.tipo });
    }

    if (filters.estado && filters.estado !== 'todos') {
      const estado = estadosEvento.find(e => e.value === filters.estado);
      active.push({ type: 'estado', label: estado?.label || filters.estado });
    }

    if (filters.hermandad && filters.hermandad !== 'todos') {
      active.push({ type: 'hermandad', label: filters.hermandad });
    }

    return active;
  };
  
  // Función para eliminar un filtro
  const removeFilter = (type) => {
    onFilterChange(type, 'todos');
  };
  
  const activeFilters = getActiveFilters();
  
  return (
    <motion.div 
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="relative w-full bg-surface rounded-2xl shadow-xl overflow-hidden border border-line"
    >
      {/* Content wrapper */}
      <div className="relative">
        {/* Header */}
        <motion.div 
          className="flex items-center justify-between p-5 cursor-pointer group"
          onClick={() => setIsExpanded(!isExpanded)}
          whileHover={{ backgroundColor: 'rgba(42, 44, 50, 0.5)' }}
          transition={{ duration: 0.2 }}
        >
          <div className="flex items-center gap-3">
            <motion.div
              className="flex items-center justify-center w-10 h-10 rounded-xl bg-brand-soft border border-brand/30"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <Filter size={20} className="text-brand" />
            </motion.div>

            <div>
              <h2 className="text-base font-bold text-fg flex items-center gap-2">
                Filtros de Búsqueda
                {activeFilters.length > 0 && (
                  <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="bg-brand text-bg text-xs font-bold rounded-full h-6 w-6
                             flex items-center justify-center shadow-lg"
                  >
                    {activeFilters.length}
                  </motion.span>
                )}
              </h2>
              <p className="text-xs text-muted mt-0.5">
                {activeFilters.length === 0 ? 'Personaliza tu búsqueda' : `${activeFilters.length} filtro${activeFilters.length > 1 ? 's' : ''} activo${activeFilters.length > 1 ? 's' : ''}`}
              </p>
            </div>
          </div>
          
          <motion.div
            animate={{ rotate: isExpanded ? 180 : 0 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
          >
            <ChevronDown size={24} className="text-brand" />
          </motion.div>
        </motion.div>
        
        {/* Active filters chips */}
        <AnimatePresence>
          {activeFilters.length > 0 && (
            <motion.div 
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="px-5 pb-3 flex flex-wrap gap-2"
            >
              {activeFilters.map((filter, index) => (
                <motion.div 
                  key={index}
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0, opacity: 0 }}
                  transition={{ delay: index * 0.05 }}
                  // Chip de filtro activo: SUAVE con borde (como los tags de
                  // categoría), a propósito distinto del badge sólido de estado
                  // de las tarjetas — antes eran el mismo verde y se confundían.
                  className="flex items-center gap-2 bg-brand-soft border border-brand/30 text-sm
                           text-brand rounded-full px-3.5 py-1.5 transition-colors hover:bg-brand/20"
                >
                  <span className="font-medium">{filter.label}</span>
                  <motion.button
                    whileHover={{ scale: 1.2, rotate: 90 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={(e) => {
                      e.stopPropagation();
                      removeFilter(filter.type);
                    }}
                    className="ml-0.5 hover:text-danger transition-colors"
                  >
                    <X size={16} />
                  </motion.button>
                </motion.div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
        
        {/* Filter controls */}
        <AnimatePresence>
          {isExpanded && (
            <motion.div 
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3 }}
              className="border-t border-line"
            >
              <div className="p-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {/* Tipo de Evento */}
                  <div>
                    <label htmlFor={`${idBase}-tipo`} className="block text-sm font-medium text-muted mb-2">
                      Tipo de Evento
                    </label>
                    <select
                      id={`${idBase}-tipo`}
                      value={filters.tipo}
                      onChange={(e) => onFilterChange('tipo', e.target.value)}
                      className={selectClasses}
                    >
                      {opcionesTipo.map(tipo => (
                        <option key={tipo.value} value={tipo.value}>
                          {tipo.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Estado */}
                  <div>
                    <label htmlFor={`${idBase}-estado`} className="block text-sm font-medium text-muted mb-2">
                      Estado
                    </label>
                    <select
                      id={`${idBase}-estado`}
                      value={filters.estado}
                      onChange={(e) => onFilterChange('estado', e.target.value)}
                      className={selectClasses}
                    >
                      {estadosEvento.map(estado => (
                        <option key={estado.value} value={estado.value}>
                          {estado.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Comunidades */}
                  <div className="sm:col-span-2 lg:col-span-1">
                    <label htmlFor={`${idBase}-hermandad`} className="block text-sm font-medium text-muted mb-2">
                      Comunidades
                    </label>
                    <select
                      id={`${idBase}-hermandad`}
                      value={filters.hermandad}
                      onChange={(e) => onFilterChange('hermandad', e.target.value)}
                      className={selectClasses}
                    >
                      {opcionesHermandad.map(hermandad => (
                        <option key={hermandad.value} value={hermandad.value}>
                          {hermandad.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}