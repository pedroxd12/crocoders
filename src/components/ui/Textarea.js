export default function Textarea({
    label,
    name,
    value,
    onChange,
    placeholder = '',
    required = false,
    rows = 3,
    className = '',
    ...props
  }) {
    return (
      <div className={`mb-4 ${className}`}>
        {label && (
          <label className="block text-gray-300 mb-2">
            {label}
            {required && <span className="text-red-500"> *</span>}
          </label>
        )}
        <textarea
          name={name}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          required={required}
          rows={rows}
          className="w-full bg-gray-700 border border-gray-600 rounded p-2 text-white focus:border-[#1ef184] focus:outline-none focus:ring-1 focus:ring-[#1ef184]"
          {...props}
        />
      </div>
    );
  }