const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const sharp = require('sharp');

// Allowed MIME types and their magic bytes signatures
const ALLOWED_TYPES = {
  'image/jpeg': { extensions: ['.jpg', '.jpeg'], signatures: [[0xFF, 0xD8, 0xFF]] },
  'image/png': { extensions: ['.png'], signatures: [[0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]] },
  'image/gif': { extensions: ['.gif'], signatures: [[0x47, 0x49, 0x46, 0x38, 0x37, 0x61], [0x47, 0x49, 0x46, 0x38, 0x39, 0x61]] },
  'image/webp': { extensions: ['.webp'], signatures: [[0x52, 0x49, 0x46, 0x46]] } // RIFF header
};

// Créer les dossiers nécessaires
const uploadDir = path.join(__dirname, '..', 'uploads');
const avatarsDir = path.join(uploadDir, 'avatars');
const platsDir = path.join(uploadDir, 'plats');
const liticesDir = path.join(uploadDir, 'litiges');
const thumbnailsDir = path.join(uploadDir, 'thumbnails');

[uploadDir, avatarsDir, platsDir, liticesDir, thumbnailsDir].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

/**
 * Validate file magic bytes to prevent spoofed files
 * @param {Buffer} buffer - File buffer to check
 * @returns {string|null} - Detected MIME type or null if invalid
 */
const validateMagicBytes = (buffer) => {
  for (const [mimeType, config] of Object.entries(ALLOWED_TYPES)) {
    for (const signature of config.signatures) {
      const matches = signature.every((byte, index) => buffer[index] === byte);
      if (matches) {
        return mimeType;
      }
    }
  }
  return null;
};

/**
 * Validate uploaded file by checking magic bytes
 * @param {string} filePath - Path to the uploaded file
 * @returns {Promise<{valid: boolean, mimeType: string|null}>}
 */
const validateUploadedFile = async (filePath) => {
  try {
    // Read first 12 bytes for magic number detection
    const fd = fs.openSync(filePath, 'r');
    const buffer = Buffer.alloc(12);
    fs.readSync(fd, buffer, 0, 12, 0);
    fs.closeSync(fd);
    
    const detectedMime = validateMagicBytes(buffer);
    return {
      valid: detectedMime !== null,
      mimeType: detectedMime
    };
  } catch (error) {
    return { valid: false, mimeType: null };
  }
};

// Configuration du stockage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    let dest = uploadDir;
    
    // Déterminer le dossier selon le type d'upload
    if (req.baseUrl.includes('users') || req.path.includes('avatar')) {
      dest = avatarsDir;
    } else if (req.baseUrl.includes('plats')) {
      dest = platsDir;
    } else if (req.baseUrl.includes('litiges')) {
      dest = liticesDir;
    }
    
    cb(null, dest);
  },
  filename: (req, file, cb) => {
    // Générer un nom unique avec UUID
    const uniqueName = `${uuidv4()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

// Filtre des types de fichiers
const fileFilter = (req, file, cb) => {
  // Types MIME autorisés
  const allowedMimes = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
    'image/webp'
  ];

  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Type de fichier non autorisé. Utilisez JPG, PNG, GIF ou WebP.'), false);
  }
};

// Configuration Multer
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 5 * 1024 * 1024, // 5MB par défaut
    files: 5 // Maximum 5 fichiers par requête
  }
});

// Middlewares d'upload prédéfinis
const uploadAvatar = upload.single('avatar');
const uploadPlatImage = upload.single('image');
const uploadLitigeFiles = upload.array('fichiers', 5);

/**
 * Middleware pour supprimer un fichier
 */
const deleteFile = (filePath) => {
  const fullPath = path.join(uploadDir, filePath);
  if (fs.existsSync(fullPath)) {
    fs.unlinkSync(fullPath);
    return true;
  }
  return false;
};

/**
 * Génère l'URL publique d'un fichier uploadé
 */
const getFileUrl = (filename, type = 'plats') => {
  if (!filename) return null;
  return `/uploads/${type}/${filename}`;
};

/**
 * Process and optimize image using Sharp
 * @param {string} inputPath - Input file path
 * @param {string} outputDir - Output directory
 * @param {string} filename - Base filename (without extension)
 * @param {Object} options - Processing options
 * @returns {Promise<{main: string, thumbnail: string}>}
 */
const processImage = async (inputPath, outputDir, filename, options = {}) => {
  const {
    maxWidth = 1200,
    maxHeight = 1200,
    quality = 80,
    thumbnailSize = 300,
    format = 'webp'
  } = options;

  const mainFilename = `${filename}.${format}`;
  const thumbFilename = `${filename}_thumb.${format}`;
  const mainPath = path.join(outputDir, mainFilename);
  const thumbPath = path.join(thumbnailsDir, thumbFilename);

  try {
    // Process main image
    await sharp(inputPath)
      .resize(maxWidth, maxHeight, { 
        fit: 'inside', 
        withoutEnlargement: true 
      })
      .webp({ quality })
      .toFile(mainPath);

    // Generate thumbnail
    await sharp(inputPath)
      .resize(thumbnailSize, thumbnailSize, { 
        fit: 'cover',
        position: 'center'
      })
      .webp({ quality: 70 })
      .toFile(thumbPath);

    // Remove original file if different from output
    if (inputPath !== mainPath && fs.existsSync(inputPath)) {
      fs.unlinkSync(inputPath);
    }

    return {
      main: mainFilename,
      thumbnail: thumbFilename
    };
  } catch (error) {
    console.error('Error processing image:', error);
    throw error;
  }
};

/**
 * Middleware to validate and process uploaded image
 */
const validateAndProcessImage = (type = 'plats') => async (req, res, next) => {
  if (!req.file) {
    return next();
  }

  const filePath = req.file.path;
  
  // Validate magic bytes
  const validation = await validateUploadedFile(filePath);
  if (!validation.valid) {
    // Delete the invalid file
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    return res.status(400).json({
      success: false,
      message: 'Type de fichier non autorisé. Le contenu du fichier ne correspond pas à une image valide.'
    });
  }

  try {
    // Get output directory based on type
    let outputDir;
    switch (type) {
      case 'avatars':
        outputDir = avatarsDir;
        break;
      case 'litiges':
        outputDir = liticesDir;
        break;
      default:
        outputDir = platsDir;
    }

    // Process and optimize image
    const baseFilename = path.basename(req.file.filename, path.extname(req.file.filename));
    const processed = await processImage(filePath, outputDir, baseFilename, {
      maxWidth: type === 'avatars' ? 400 : 1200,
      maxHeight: type === 'avatars' ? 400 : 1200,
      thumbnailSize: type === 'avatars' ? 100 : 300
    });

    // Update file info in request
    req.file.filename = processed.main;
    req.file.thumbnail = processed.thumbnail;
    req.file.processedPath = path.join(outputDir, processed.main);

    next();
  } catch (error) {
    // Clean up on error
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    return res.status(500).json({
      success: false,
      message: 'Erreur lors du traitement de l\'image.'
    });
  }
};

module.exports = {
  upload,
  uploadAvatar,
  uploadPlatImage,
  uploadLitigeFiles,
  deleteFile,
  getFileUrl,
  validateAndProcessImage,
  processImage,
  validateUploadedFile,
  validateMagicBytes
};
