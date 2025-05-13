export default function Input({
    label,
    type = 'text',
    name,
    value,
    onChange,
    placeholder = '',
    required = false,
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
        <input
          type={type}
          name={name}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          required={required}
          className="w-full bg-gray-700 border border-gray-600 rounded p-2 text-white focus:border-[#1ef184] focus:outline-none focus:ring-1 focus:ring-[#1ef184]"
          {...props}
        />
      </div>
    );
  }