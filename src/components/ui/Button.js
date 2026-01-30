export default function Button({
  children,
  onClick,
  type = 'button',
  variant = 'primary',
  size = 'md',
  color,
  className = '',
  disabled = false
}) {
  const baseStyles = 'rounded font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800';
  
  const sizeStyles = {
    sm: 'px-2 py-1 text-xs',
    md: 'px-4 py-2 text-sm',
    lg: 'px-6 py-3 text-base'
  };
  
  const variantStyles = {
    primary: 'bg-[#1ef184] hover:bg-[#15c46e] text-gray-900 focus:ring-[#1ef184]',
    secondary: 'bg-gray-600 hover:bg-gray-500 text-white focus:ring-gray-500',
    text: 'bg-transparent hover:bg-gray-700 text-current focus:ring-gray-500'
  };
  
  const colorStyles = {
    red: 'text-red-400 hover:text-red-300',
    green: 'text-green-400 hover:text-green-300',
    yellow: 'text-yellow-400 hover:text-yellow-300',
    purple: 'text-purple-400 hover:text-purple-300',
    blue: 'text-blue-400 hover:text-blue-300'
  };
  
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`
        ${baseStyles}
        ${sizeStyles[size]}
        ${variantStyles[variant]}
        ${variant === 'text' && color ? colorStyles[color] : ''}
        ${className}
        ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
      `}
    >
      {children}
    </button>
  );
}