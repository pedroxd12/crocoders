export default function LoadingSpinner({ text = 'Cargando...' }) {
    return (
      <div className="flex flex-col items-center justify-center space-y-4">
        <div className="w-12 h-12 border-4 border-[#1ef184] border-t-transparent rounded-full animate-spin"></div>
        <p className="text-gray-300">{text}</p>
      </div>
    );
  }