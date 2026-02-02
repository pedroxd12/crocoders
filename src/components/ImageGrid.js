'use client';
import { useState, useEffect } from 'react';
import Image from 'next/image';
import styles from './ImageGrid.module.css';

const images = [
  '/club/1.jpeg',
  '/club/2.jpeg',
  '/club/3.jpeg'
];

export default function ImageGrid() {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentImageIndex((prevIndex) => (prevIndex + 1) % images.length);
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className={styles.wrapper}>
      <div className={styles.container}>
        <div className={`${styles.column} ${styles.column1}`}>
          <div className={`${styles.item} ${styles.item1}`}>
            <Image 
              src={images[currentImageIndex]} 
              alt="Club image" 
              fill
              sizes="(max-width: 768px) 100vw, 33vw"
              style={{ objectFit: 'cover' }}
              priority
            />
          </div>
          <div className={`${styles.item} ${styles.item2}`}>
            <Image 
              src={images[(currentImageIndex + 1) % images.length]} 
              alt="Club image" 
              fill
              sizes="(max-width: 768px) 100vw, 33vw"
              style={{ objectFit: 'cover' }}
            />
          </div>
          <div className={`${styles.item} ${styles.item3}`}>
            <Image 
              src={images[(currentImageIndex + 2) % images.length]} 
              alt="Club image" 
              fill
              sizes="(max-width: 768px) 100vw, 33vw"
              style={{ objectFit: 'cover' }}
            />
          </div>
        </div>

        <div className={`${styles.column} ${styles.column2}`}>
          <div className={`${styles.item} ${styles.item1}`}>
            <Image 
              src={images[(currentImageIndex + 2) % images.length]} 
              alt="Club image" 
              fill
              sizes="(max-width: 768px) 100vw, 33vw"
              style={{ objectFit: 'cover' }}
            />
          </div>
          <div className={`${styles.item} ${styles.item2}`}>
            <Image 
              src={images[currentImageIndex]} 
              alt="Club image" 
              fill
              sizes="(max-width: 768px) 100vw, 33vw"
              style={{ objectFit: 'cover' }}
            />
          </div>
          <div className={`${styles.item} ${styles.item3}`}>
            <Image 
              src={images[(currentImageIndex + 1) % images.length]} 
              alt="Club image" 
              fill
              sizes="(max-width: 768px) 100vw, 33vw"
              style={{ objectFit: 'cover' }}
            />
          </div>
        </div>

        <div className={`${styles.column} ${styles.column3}`}>
          <div className={`${styles.item} ${styles.item1}`}>
            <Image 
              src={images[(currentImageIndex + 1) % images.length]} 
              alt="Club image" 
              fill
              sizes="(max-width: 768px) 100vw, 33vw"
              style={{ objectFit: 'cover' }}
            />
          </div>
          <div className={`${styles.item} ${styles.item2}`}>
            <Image 
              src={images[(currentImageIndex + 2) % images.length]} 
              alt="Club image" 
              fill
              sizes="(max-width: 768px) 100vw, 33vw"
              style={{ objectFit: 'cover' }}
            />
          </div>
          <div className={`${styles.item} ${styles.item3}`}>
            <Image 
              src={images[currentImageIndex]} 
              alt="Club image" 
              fill
              sizes="(max-width: 768px) 100vw, 33vw"
              style={{ objectFit: 'cover' }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
