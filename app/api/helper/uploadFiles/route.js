import { NextResponse } from 'next/server';
import { v2 as cloudinary } from 'cloudinary';
import path from 'path';

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export async function POST(request) {
  try {
    console.log('🚀 Cloudinary Upload API started');
    console.log('🔧 Cloudinary Config:', {
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY ? '***configured***' : 'missing',
      api_secret: process.env.CLOUDINARY_API_SECRET ? '***configured***' : 'missing'
    });
    
    const data = await request.formData();
    const files = data.getAll('files');

    if (!files || files.length === 0) {
      console.log('❌ No files received');
      return NextResponse.json({ 
        success: false,
        error: 'No files uploaded' 
      }, { status: 400 });
    }

    console.log(`📁 Processing ${files.length} files for Cloudinary upload`);

    const allowedTypes = ['.csv', '.xls', '.xlsx', '.pdf', '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'];
    const uploadedFiles = [];
    const maxFileSize = 10 * 1024 * 1024; // 10MB limit

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      
      if (!file || !file.name) {
        console.log(`❌ File ${i} is invalid or has no name`);
        continue;
      }

      const originalName = file.name;
      const fileExt = path.extname(originalName).toLowerCase();

      // Check file type
      if (!allowedTypes.includes(fileExt)) {
        return NextResponse.json({
          success: false,
          error: `Invalid file type: ${fileExt}. Only .csv, .xls, .xlsx, .pdf, .jpg, .jpeg, .png, .gif, .bmp, .webp are allowed.`
        }, { status: 400 });
      }

      // Check file size
      if (file.size > maxFileSize) {
        return NextResponse.json({
          success: false,
          error: `File too large: ${originalName}. Maximum size is 10MB.`
        }, { status: 400 });
      }

      try {
        console.log(`📤 Processing file: ${originalName} (${file.size} bytes)`);
        
        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);
        
        if (buffer.length === 0) {
          console.log(`⚠️ Empty file: ${originalName}`);
          return NextResponse.json({
            success: false,
            error: `Empty file: ${originalName}`
          }, { status: 400 });
        }

        // Convert buffer to base64 for Cloudinary upload
        const base64String = `data:${file.type};base64,${buffer.toString('base64')}`;
        
        // Generate unique public_id WITHOUT folder prefix (folder will be added by Cloudinary)
        const timestamp = Date.now();
        const random = Math.floor(Math.random() * 10000);
        const basename = path.basename(originalName, fileExt).replace(/[^a-zA-Z0-9._-]/g, '_');
        const sanitizedBasename = basename.substring(0, 50);
        const filename = `${timestamp}_${random}_${sanitizedBasename}`;

        console.log(`☁️ Uploading to Cloudinary: ${originalName} -> ${filename}`);

        // Determine resource type based on file extension
        let resourceType = 'raw'; // Default to raw for documents
        const imageTypes = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'];
        
        if (imageTypes.includes(fileExt)) {
          resourceType = 'image';
        }

        console.log(`📝 Using resource_type: ${resourceType}`);

        // Upload to Cloudinary - use folder option properly
        const uploadResult = await cloudinary.uploader.upload(base64String, {
          folder: 'email-attachments', // This will create the folder structure
          public_id: filename, // Just the filename, not the full path
          resource_type: resourceType,
          use_filename: false,
          unique_filename: false,
          overwrite: false,
          tags: ['email-attachment', 'temporary'],
          context: {
            original_name: originalName,
            uploaded_at: new Date().toISOString(),
            resource_type_used: resourceType
          }
        });

        console.log(`✅ Cloudinary upload successful:`, {
          public_id: uploadResult.public_id,
          url: uploadResult.secure_url,
          format: uploadResult.format,
          resource_type: uploadResult.resource_type,
          bytes: uploadResult.bytes
        });

        uploadedFiles.push({
          originalName: originalName,
          savedName: uploadResult.public_id, // This will be email-attachments/filename
          cloudinaryPublicId: uploadResult.public_id,
          cloudinaryUrl: uploadResult.secure_url,
          size: uploadResult.bytes || buffer.length,
          type: file.type,
          format: uploadResult.format,
          resourceType: resourceType, // Store the type we used for upload
          uploadedAt: new Date().toISOString()
        });

        console.log(`✅ File processed: ${originalName} -> ${uploadResult.public_id}`);

      } catch (fileError) {
        console.error(`❌ Error uploading ${originalName} to Cloudinary:`, fileError);
        
        let errorMessage = `Failed to upload ${originalName} to Cloudinary`;
        if (fileError.error && fileError.error.message) {
          errorMessage += `: ${fileError.error.message}`;
        } else if (fileError.message) {
          errorMessage += `: ${fileError.message}`;
        }

        return NextResponse.json({
          success: false,
          error: errorMessage,
          details: {
            file: originalName,
            cloudinaryError: fileError.error?.message || fileError.message,
            http_code: fileError.error?.http_code
          }
        }, { status: 500 });
      }
    }

    if (uploadedFiles.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'No files were successfully uploaded'
      }, { status: 400 });
    }

    console.log(`🎉 Successfully uploaded ${uploadedFiles.length} files to Cloudinary`);

    return NextResponse.json({
      success: true,
      message: `Successfully uploaded ${uploadedFiles.length} files to Cloudinary`,
      files: uploadedFiles,
      uploadedCount: uploadedFiles.length,
      cloudinaryFolder: 'email-attachments'
    });

  } catch (error) {
    console.error('❌ Cloudinary Upload API Error:', error);
    
    if (error.message && error.message.includes('Must supply cloud_name')) {
      return NextResponse.json({
        success: false,
        error: 'Cloudinary configuration error: Missing cloud_name',
        details: 'Please check your CLOUDINARY_CLOUD_NAME environment variable'
      }, { status: 500 });
    }

    if (error.message && error.message.includes('Must supply api_key')) {
      return NextResponse.json({
        success: false,
        error: 'Cloudinary configuration error: Missing API key',
        details: 'Please check your CLOUDINARY_API_KEY environment variable'
      }, { status: 500 });
    }

    if (error.message && error.message.includes('Must supply api_secret')) {
      return NextResponse.json({
        success: false,
        error: 'Cloudinary configuration error: Missing API secret',
        details: 'Please check your CLOUDINARY_API_SECRET environment variable'
      }, { status: 500 });
    }

    return NextResponse.json({
      success: false,
      error: 'Upload failed',
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    }, { status: 500 });
  }
}