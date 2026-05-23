'use client';
import { useState } from 'react';
import { ChevronDown, Filter, X, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const tiposEvento = [
  { value: 'todos', label: 'Todos los tipos' },
  { value: 'conferencia', label: 'Conferencia' },
  { value: 'curso', label: 'Curso' },
  { value: 'concurso', label: 'Concurso' },
  { value: 'reunion', label: 'Reunión' }
];

const estadosEvento = [
  { value: 'proximos', label: 'Próximos' },
  { value: 'pasados', label: 'Pasados' },
  { value: 'todos', label: 'Todos' }
];

const hermandades = [
  { value: 'todos', label: 'Todas las comunidades' },
  { value: 'club de programación', label: 'Club de Programación' },
  { value: 'computer society', label: 'Computer Society' }
];

export default function FilterControls({ filters, onFilterChange }) {
  const [isExpanded, setIsExpanded] = useState(false);
  
  // Función para mostrar chips de filtros activos
  const getActiveFilters = () => {
    const active = [];
    
    if (filters.tipo && filters.tipo !== 'todos') {
      const tipo = tiposEvento.find(t => t.value === filters.tipo);
      active.push({ type: 'tipo', label: tipo?.label || filters.tipo });
    }
    
    if (filters.estado && filters.estado !== 'todos') {
      const estado = estadosEvento.find(e => e.value === filters.estado);
      active.push({ type: 'estado', label: estado?.label || filters.estado });
    }
    
    if (filters.hermandad && filters.hermandad !== 'todos') {
      const hermandad = hermandades.find(h => h.value === filters.hermandad);
      active.push({ type: 'hermandad', label: hermandad?.label || filters.hermandad });
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
      className="relative w-full bg-gradient-to-br from-gray-900/80 via-gray-900/90 to-black/90 
                 rounded-2xl shadow-2xl overflow-hidden backdrop-blur-sm border border-gray-800/50"
    >
      {/* Content wrapper */}
      <div className="relative">
        {/* Header */}
        <motion.div 
          className="flex items-center justify-between p-5 cursor-pointer group"
          onClick={() => setIsExpanded(!isExpanded)}
          whileHover={{ backgroundColor: 'rgba(31, 41, 55, 0.5)' }}
          transition={{ duration: 0.2 }}
        >
          <div className="flex items-center gap-3">
            <motion.div
              className="flex items-center justify-center w-10 h-10 rounded-xl 
                       bg-gradient-to-br from-green-500/20 to-emerald-500/20 
                       border border-green-500/30"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <Filter size={20} className="text-green-400" />
            </motion.div>
            
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                Filtros de Búsqueda
                {activeFilters.length > 0 && (
                  <motion.span 
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="bg-gradient-to-r from-green-500 to-emerald-500 
                             text-white text-xs font-bold rounded-full h-6 w-6 
                             flex items-center justify-center shadow-lg"
                  >
                    {activeFilters.length}
                  </motion.span>
                )}
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">
                {activeFilters.length === 0 ? 'Personaliza tu búsqueda' : `${activeFilters.length} filtro${activeFilters.length > 1 ? 's' : ''} activo${activeFilters.length > 1 ? 's' : ''}`}
              </p>
            </div>
          </div>
          
          <motion.div
            animate={{ rotate: isExpanded ? 180 : 0 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
          >
            <ChevronDown size={24} className="text-green-400" />
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
                  className="flex items-center gap-2 bg-gradient-to-r from-green-500/20 to-emerald-500/20 
                           border border-green-500/30 text-sm text-white rounded-full px-4 py-2
                           backdrop-blur-sm shadow-lg hover:from-green-500/30 hover:to-emerald-500/30 
                           transition-all duration-200"
                >
                  <Sparkles size={14} className="text-green-400" />
                  <span className="font-medium">{filter.label}</span>
                  <motion.button
                    whileHover={{ scale: 1.2, rotate: 90 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={(e) => {
                      e.stopPropagation();
                      removeFilter(filter.type);
                    }}
                    className="ml-1 hover:text-red-400 transition-colors"
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
              className="border-t border-gray-800/50 bg-gradient-to-b from-gray-900/50 to-transparent"
            >
              <div className="p-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {/* Tipo de Evento */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-300 mb-2">
                      Tipo de Evento
                    </label>
                    <select
                      value={filters.tipo}
                      onChange={(e) => onFilterChange('tipo', e.target.value)}
                      className="w-full p-3 text-sm rounded-xl bg-gray-800/80 text-white 
                               border border-gray-700/50 focus:border-green-500/50 
                               focus:ring-2 focus:ring-green-500/20 focus:outline-none
                               transition-all duration-200 cursor-pointer backdrop-blur-sm
                               hover:border-green-500/30"
                    >
                      {tiposEvento.map(tipo => (
                        <option key={tipo.value} value={tipo.value}>
                          {tipo.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Estado */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-300 mb-2">
                      Estado
                    </label>
                    <select
                      value={filters.estado}
                      onChange={(e) => onFilterChange('estado', e.target.value)}
                      className="w-full p-3 text-sm rounded-xl bg-gray-800/80 text-white 
                               border border-gray-700/50 focus:border-green-500/50 
                               focus:ring-2 focus:ring-green-500/20 focus:outline-none
                               transition-all duration-200 cursor-pointer backdrop-blur-sm
                               hover:border-green-500/30"
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
                    <label className="block text-sm font-semibold text-gray-300 mb-2">
                      Comunidades
                    </label>
                    <select
                      value={filters.hermandad}
                      onChange={(e) => onFilterChange('hermandad', e.target.value)}
                      className="w-full p-3 text-sm rounded-xl bg-gray-800/80 text-white 
                               border border-gray-700/50 focus:border-green-500/50 
                               focus:ring-2 focus:ring-green-500/20 focus:outline-none
                               transition-all duration-200 cursor-pointer backdrop-blur-sm
                               hover:border-green-500/30"
                    >
                      {hermandades.map(hermandad => (
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