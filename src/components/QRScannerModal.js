'use client';
import { useState, useRef, useEffect } from 'react';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import { FaQrcode, FaCheckCircle, FaTimesCircle, FaCamera } from 'react-icons/fa';
import { toast } from 'react-toastify';

export default function QRScannerModal({ isOpen, onClose, onSuccess }) {
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [hasCamera, setHasCamera] = useState(true);
  const [useManual, setUseManual] = useState(false);

  useEffect(() => {
    if (isOpen && !useManual) {
      startCamera();
    }
    
    return () => {
      stopCamera();
    };
  }, [isOpen, useManual]);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment' } 
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;
        setScanning(true);
      }
    } catch (error) {
      console.error('Error accessing camera:', error);
      setHasCamera(false);
      setUseManual(true);
      toast.error('No se pudo acceder a la cámara. Usa el modo manual.');
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setScanning(false);
  };

  const handleManualSubmit = async (e) => {
    e.preventDefault();
    if (!manualCode.trim()) {
      toast.warning('Ingresa el código QR');
      return;
    }
    await verifyQR(manualCode.trim());
  };

  const verifyQR = async (qrCode) => {
    setProcessing(true);
    try {
      const res = await fetch('/api/eventos/verify-qr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ qrToken: qrCode })
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setResult({
          success: false,
          message: data.error || 'Error al verificar el código'
        });
        toast.error(data.error || 'Código inválido');
        return;
      }

      setResult({
        success: true,
        alreadyRegistered: data.alreadyRegistered,
        message: data.message,
        data: data.data
      });

      if (!data.alreadyRegistered) {
        toast.success('¡Asistencia registrada!');
        if (onSuccess) onSuccess(data.data);
      } else {
        toast.info('Asistencia ya registrada previamente');
      }
      
    } catch (error) {
      console.error('Error verifying QR:', error);
      setResult({
        success: false,
        message: 'Error al procesar la solicitud'
      });
      toast.error('Error al procesar la solicitud');
    } finally {
      setProcessing(false);
    }
  };

  const handleScanFromCamera = () => {
    if (!videoRef.current) return;
    
    // Create canvas to capture video frame
    const canvas = document.createElement('canvas');
    const video = videoRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0);
    
    // You would typically use a library like jsQR here
    // For now, we'll use manual input as fallback
    toast.info('Por favor usa el modo manual por ahora');
    setUseManual(true);
  };

  const handleClose = () => {
    stopCamera();
    setResult(null);
    setManualCode('');
    setUseManual(false);
    onClose();
  };

  const handleNewScan = () => {
    setResult(null);
    setManualCode('');
    if (!useManual) {
      startCamera();
    }
  };

  return (
    <Modal 
      isOpen={isOpen} 
      onClose={handleClose} 
      title="Escanear Código QR"
      size="lg"
    >
      <div className="space-y-4">
        {!result ? (
          <>
            <div className="flex justify-center gap-2 mb-4">
              {hasCamera && (
                <Button
                  onClick={() => setUseManual(false)}
                  variant={!useManual ? 'primary' : 'secondary'}
                  size="sm"
                >
                  <FaCamera className="mr-2" /> Cámara
                </Button>
              )}
              <Button
                onClick={() => {
                  stopCamera();
                  setUseManual(true);
                }}
                variant={useManual ? 'primary' : 'secondary'}
                size="sm"
              >
                <FaQrcode className="mr-2" /> Manual
              </Button>
            </div>

            {!useManual ? (
              <div className="bg-black rounded-lg overflow-hidden relative">
                <video 
                  ref={videoRef} 
                  autoPlay 
                  playsInline
                  className="w-full h-64 object-cover"
                />
                {scanning && (
                  <div className="absolute inset-0 border-4 border-green-500 border-dashed animate-pulse" />
                )}
                <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2">
                  <Button onClick={handleScanFromCamera} disabled={processing}>
                    {processing ? 'Procesando...' : 'Capturar QR'}
                  </Button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleManualSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Código del Ticket
                  </label>
                  <textarea
                    value={manualCode}
                    onChange={(e) => setManualCode(e.target.value)}
                    placeholder="Pega aquí el código del ticket QR..."
                    className="w-full h-32 bg-gray-700 border border-gray-600 rounded-lg p-3 text-white focus:border-green-500 focus:outline-none resize-none"
                    disabled={processing}
                  />
                </div>
                <Button 
                  type="submit" 
                  className="w-full"
                  loading={processing}
                  disabled={!manualCode.trim()}
                >
                  Verificar Código
                </Button>
              </form>
            )}
          </>
        ) : (
          <div className="text-center py-6">
            <div className={`inline-flex items-center justify-center w-20 h-20 rounded-full mb-4 ${
              result.success ? 'bg-green-500/20' : 'bg-red-500/20'
            }`}>
              {result.success ? (
                <FaCheckCircle className="text-green-500 text-5xl" />
              ) : (
                <FaTimesCircle className="text-red-500 text-5xl" />
              )}
            </div>
            
            <h3 className={`text-xl font-bold mb-2 ${
              result.success ? 'text-green-400' : 'text-red-400'
            }`}>
              {result.message}
            </h3>
            
            {result.success && result.data && (
              <div className="bg-gray-800 rounded-lg p-4 mt-4 text-left">
                <p className="text-white font-semibold text-lg mb-2">
                  {result.data.nombre}
                </p>
                <p className="text-gray-400 text-sm">{result.data.correo}</p>
                <p className="text-gray-400 text-sm mt-2">
                  {result.data.evento}
                </p>
                {result.alreadyRegistered && result.data.fecha_registro && (
                  <p className="text-yellow-400 text-xs mt-2">
                    Registrado: {new Date(result.data.fecha_registro).toLocaleString('es-MX')}
                  </p>
                )}
              </div>
            )}
            
            <div className="flex gap-2 mt-6">
              <Button onClick={handleNewScan} variant="secondary" className="flex-1">
                Escanear Otro
              </Button>
              <Button onClick={handleClose} variant="primary" className="flex-1">
                Cerrar
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
