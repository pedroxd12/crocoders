'use client';
import { useState } from 'react';
import { ChevronDown, Filter, X } from 'lucide-react';

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
    <div className="bg-gray-800 rounded-lg shadow-md overflow-hidden transition-all duration-300">
      {/* Cabecera del filtro con toggle */}
      <div 
        className="flex items-center justify-between p-3 cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center space-x-2 text-white">
          <Filter size={18} className="text-green-400" />
          <h2 className="text-sm font-semibold">Filtros</h2>
          {activeFilters.length > 0 && (
            <span className="bg-green-500 text-xs rounded-full h-5 w-5 flex items-center justify-center">
              {activeFilters.length}
            </span>
          )}
        </div>
        <ChevronDown 
          size={18} 
          className={`text-green-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} 
        />
      </div>
      
      {/* Chips de filtros activos */}
      {activeFilters.length > 0 && (
        <div className="px-3 pb-2 flex flex-wrap gap-2">
          {activeFilters.map((filter, index) => (
            <div 
              key={index} 
              className="flex items-center bg-gray-700 text-xs text-white rounded-full px-3 py-1"
            >
              <span>{filter.label}</span>
              <X 
                size={14} 
                className="ml-1 cursor-pointer hover:text-red-400" 
                onClick={(e) => {
                  e.stopPropagation();
                  removeFilter(filter.type);
                }}
              />
            </div>
          ))}
        </div>
      )}
      
      {/* Controles de filtro */}
      {isExpanded && (
        <div className="p-3 border-t border-gray-700">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Tipo de Evento</label>
              <select
                value={filters.tipo}
                onChange={(e) => onFilterChange('tipo', e.target.value)}
                className="w-full p-2 text-sm rounded-md bg-gray-700 text-white border border-gray-600 focus:border-green-400 focus:ring focus:ring-green-400 focus:ring-opacity-20 focus:outline-none"
              >
                {tiposEvento.map(tipo => (
                  <option key={tipo.value} value={tipo.value}>
                    {tipo.label}
                  </option>
                ))}
              </select>
            </div>
            
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Estado</label>
              <select
                value={filters.estado}
                onChange={(e) => onFilterChange('estado', e.target.value)}
                className="w-full p-2 text-sm rounded-md bg-gray-700 text-white border border-gray-600 focus:border-green-400 focus:ring focus:ring-green-400 focus:ring-opacity-20 focus:outline-none"
              >
                {estadosEvento.map(estado => (
                  <option key={estado.value} value={estado.value}>
                    {estado.label}
                  </option>
                ))}
              </select>
            </div>
            
            <div className="sm:col-span-2 lg:col-span-1">
              <label className="block text-xs font-medium text-gray-400 mb-1">Comunidades</label>
              <select
                value={filters.hermandad}
                onChange={(e) => onFilterChange('hermandad', e.target.value)}
                className="w-full p-2 text-sm rounded-md bg-gray-700 text-white border border-gray-600 focus:border-green-400 focus:ring focus:ring-green-400 focus:ring-opacity-20 focus:outline-none"
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
      )}
    </div>
  );
}