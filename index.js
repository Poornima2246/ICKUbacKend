const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
 const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cors = require('cors');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ✅ Configure Multer to use Cloudinary with CDN + compression
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: async (req, file) => {
    return {
      folder: 'jaggery-products',
      // ✅ Let Cloudinary handle format conversion (WebP/AVIF) dynamically
      format: 'webp', // store in WebP (lightweight, supported widely)
      transformation: [
        {
          width: 800, // higher resolution for better display
          height: 800,
          crop: 'limit',
          quality: 'auto:best', // automatic compression (keeps quality)
          fetch_format: 'auto', // ✅ Browser gets WebP/AVIF automatically
        },
      ],
    };
  },
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'), false);
    }
  },
});

// MongoDB Product Schema
const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, required: true },
    price: { type: Number, required: true, min: 0 },
    category: {
      type: String,
      required: true,
      enum: ['jaggery', 'honey', 'spices', 'other'],
    },
    isFeatured: { type: Boolean, default: false },
    image: {
      public_id: { type: String, required: true },
      url: { type: String, required: true },
      cdn_url: { type: String }, // ✅ store optimized CDN URL
    },
  },
  { timestamps: true }
);

const Product = mongoose.model('Product', productSchema);

// MongoDB connection
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI);
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error('Database connection error:', error);
    process.exit(1);
  }
};

// Routes

// Create product
app.post('/api/products', upload.single('image'), async (req, res) => {
  try {
    const { name, description, price, category, isFeatured } = req.body;

    if (!req.file) {
      return res.status(400).json({ message: 'Product image is required' });
    }

    const product = new Product({
      name,
      description,
      price,
      category,
      isFeatured: isFeatured === 'true',
      image: {
        public_id: req.file.filename,
        url: req.file.path,
        // ✅ Cloudinary CDN optimized delivery link
        cdn_url: cloudinary.url(req.file.filename, {
          fetch_format: 'auto',
          quality: 'auto',
        }),
      },
    });

    const createdProduct = await product.save();
    res.status(201).json(createdProduct);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
});

// ✅ Cloudinary CDN URL for every GET product
app.get('/api/products', async (req, res) => {
  try {
    const products = await Product.find().sort({ createdAt: -1 });

    const optimizedProducts = products.map((p) => ({
      ...p._doc,
      image: {
        ...p.image,
        cdn_url: cloudinary.url(p.image.public_id, {
          fetch_format: 'auto', // browser gets WebP/AVIF automatically
          quality: 'auto',
        }),
      },
    }));

    res.json(optimizedProducts);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
});

// Error handler
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ message: 'File is too large' });
    }
  }
  res.status(500).json({ message: error.message });
});

// Start server
const startServer = async () => {
  try {
    await connectDB();
    app.listen(PORT, () => console.log(`http://localhost:${PORT}`));
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
