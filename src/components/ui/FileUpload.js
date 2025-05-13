'use client';

import { useState, useCallback } from 'react';

export default function FileUpload({ label, onFileChange, accept, className = '' }) {
  const [fileName, setFileName] = useState('');

  const handleFileChange = useCallback((e) => {
    const file = e.target.files[0];
    if (file) {
      setFileName(file.name);
      onFileChange(file);
    }
  }, [onFileChange]);

  return (
    <div className={`mb-4 ${className}`}>
      <label className="block text-sm font-medium text-gray-300 mb-1">
        {label}
      </label>
      <div className="flex items-center">
        <label className="flex flex-col items-center px-4 py-2 bg-gray-700 rounded-lg border border-gray-600 cursor-pointer hover:bg-gray-600 transition">
          <span className="text-sm">Seleccionar archivo</span>
          <input 
            type="file" 
            className="hidden" 
            onChange={handleFileChange}
            accept={accept}
          />
        </label>
        {fileName && (
          <span className="ml-3 text-sm text-gray-400 truncate max-w-xs">
            {fileName}
          </span>
        )}
      </div>
    </div>
  );
}