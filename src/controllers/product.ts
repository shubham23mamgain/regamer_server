import { UploadApiResponse } from "cloudinary";
import { RequestHandler } from "express";
import { FilterQuery, isValidObjectId } from "mongoose";
import cloudUploader, { cloudApi } from "src/cloud";
import ProductModel, { ProductDocument } from "src/models/product";
import { UserDocument } from "src/models/user";
import categories from "src/utils/categories";
import { sendErrorRes } from "src/utils/helper";

const uploadImage = (filePath: string): Promise<UploadApiResponse> => {
    return cloudUploader.upload(filePath, {
        width: 600,
        height: 600,
        crop: "auto",
    });
};

export const listNewProduct: RequestHandler = async (req, res) => {
    const { name, price, category, description, purchasingDate, purchasingPrice } = req.body;
    const newProduct = new ProductModel({
        owner: req.user.id,
        name,
        price,
        purchasingPrice,
        category,
        description,
        purchasingDate,
    });

    const { images } = req.files;

    const isMultipleImages = Array.isArray(images);

    if (isMultipleImages && images.length > 5) {
        return sendErrorRes(res, "Image files can not be more than 5!", 422);
    }

    let invalidFileType = false;

    if (isMultipleImages) {
        for (let img of images) {
            if (!img.mimetype?.startsWith("image")) {
                invalidFileType = true;
                break;
            }
        }
    } else {
        if (images) {
            if (!images.mimetype?.startsWith("image")) {
                invalidFileType = true;
            }
        }
    }

    if (invalidFileType)
        return sendErrorRes(
            res,
            "Invalid file type, files must be image type!",
            422
        );

    // FILE UPLOAD

    if (isMultipleImages) {
        const uploadPromise = images.map((file) => uploadImage(file.filepath));
        const uploadResults = await Promise.all(uploadPromise);
        newProduct.images = uploadResults.map(({ secure_url, public_id }) => {
            return { url: secure_url, id: public_id };
        });

        newProduct.thumbnail = newProduct.images[0].url;
    } else {
        if (images) {
            const { secure_url, public_id } = await uploadImage(images.filepath);
            newProduct.images = [{ url: secure_url, id: public_id }];
            newProduct.thumbnail = secure_url;
        }
    }

    await newProduct.save();

    res.status(201).json({ message: "Added new product!" });
};

export const updateProduct: RequestHandler = async (req, res) => {

    const { name, price, category, description, purchasingPrice, purchasingDate, thumbnail } =
        req.body;
    const productId = req.params.id;
    if (!isValidObjectId(productId))
        return sendErrorRes(res, "Invalid product id!", 422);

    const product = await ProductModel.findOneAndUpdate(
        { _id: productId, owner: req.user.id },
        {
            // name,
            // price,
            // category,
            // description,
            // purchasingDate,
            // purchasingPrice
        },
        {
            new: true,
        }
    );
    if (!product) return sendErrorRes(res, "Product not found!", 404);

    if (typeof thumbnail === "string") product.thumbnail = thumbnail;

    const { images } = req.files;
    const isMultipleImages = Array.isArray(images);

    if (isMultipleImages) {
        const oldImages = product.images?.length || 0;
        if (oldImages + images.length > 5)
            return sendErrorRes(res, "Image files can not be more than 5!", 422);
    }

    let invalidFileType = false;

    if (isMultipleImages) {
        for (let img of images) {
            if (!img.mimetype?.startsWith("image")) {
                invalidFileType = true;
                break;
            }
        }
    } else {
        if (images) {
            if (!images.mimetype?.startsWith("image")) {
                invalidFileType = true;
            }
        }
    }

    if (invalidFileType)
        return sendErrorRes(
            res,
            "Invalid file type, files must be image type!",
            422
        );

    // FILE UPLOAD

    if (isMultipleImages) {
        const uploadPromise = images.map((file) => uploadImage(file.filepath));
        const uploadResults = await Promise.all(uploadPromise);
        const newImages = uploadResults.map(({ secure_url, public_id }) => {
            return { url: secure_url, id: public_id };
        });

        if (product.images) product.images.push(...newImages);
        else product.images = newImages;
    } else {
        if (images) {
            const { secure_url, public_id } = await uploadImage(images.filepath);
            if (product.images)
                product.images.push({ url: secure_url, id: public_id });
            else product.images = [{ url: secure_url, id: public_id }];
        }
    }

    await product.save();

    res.status(201).json({ message: "Product updated successfully." });
};

export const deleteProduct: RequestHandler = async (req, res) => {

    const productId = req.params.id;
    if (!isValidObjectId(productId))
        return sendErrorRes(res, "Invalid product id!", 422);

    const product = await ProductModel.findOneAndDelete({
        _id: productId,
        owner: req.user.id,
    });

    if (!product) return sendErrorRes(res, "Product not found!", 404);

    // First remove all images of products from cloudinary
    const images = product.images || [];
    if (images.length) {
        const ids = images.map(({ id }) => id);
        await cloudApi.delete_resources(ids);
    }

    res.json({ message: "Product removed successfully." });
};

export const deleteProductImage: RequestHandler = async (req, res) => {

    const { productId, imageId } = req.params;
    if (!isValidObjectId(productId))
        return sendErrorRes(res, "Invalid product id!", 422);

    const product = await ProductModel.findOneAndUpdate(
        { _id: productId, owner: req.user.id },
        {
            $pull: {
                images: { id: imageId },
            },
        },
        { new: true }
    );

    if (!product) return sendErrorRes(res, "Product not found!", 404);

    if (product.thumbnail?.includes(imageId)) {
        const images = product.images;
        if (images) product.thumbnail = images[0].url;
        else product.thumbnail = "";
        await product.save();
    }

    await cloudUploader.destroy(imageId);

    res.json({ message: "Image removed successfully." });
};

export const getProductDetail: RequestHandler = async (req, res) => {

    const { id } = req.params;
    if (!isValidObjectId(id))
        return sendErrorRes(res, "Invalid product id!", 422);

    const product = await ProductModel.findById(id).populate<{
        owner: UserDocument;
    }>("owner");
    if (!product) return sendErrorRes(res, "Product not found!", 404);

    res.json({
        product: {
            id: product._id,
            name: product.name,
            description: product.description,
            thumbnail: product.thumbnail,
            category: product.category,
            date: product.purchasingDate,
            price: product.price,
            purchasingPrice: product.purchasingPrice,
            image: product.images?.map(({ url }) => url),
            seller: {
                id: product.owner._id,
                name: product.owner.name,
                avatar: product.owner.avatar?.url,
            },
        },
    });
};

export const getProductsByCategory: RequestHandler = async (req, res) => {
    const { category } = req.params;
    const { pageNo = "1", limit = "10" } = req.query as {
        pageNo: string;
        limit: string;
    };
    if (!categories.includes(category))
        return sendErrorRes(res, "Invalid category!", 422);

    const products = await ProductModel.find({ category })
        .sort("-createdAt")
        .skip((+pageNo - 1) * +limit)
        .limit(+limit);

    const listings = products.map((p) => {
        return {
            id: p._id,
            name: p.name,
            thumbnail: p.thumbnail,
            category: p.category,
            price: p.price,
            purchasingPrice: p.purchasingPrice
        };
    });

    res.json({ products: listings });
};

export const getLatestProducts: RequestHandler = async (req, res) => {

    const products = await ProductModel.find().sort("-createdAt").limit(10);

    const listings = products.map((p) => {
        return {
            id: p._id,
            name: p.name,
            thumbnail: p.thumbnail,
            category: p.category,
            price: p.price,
            purchasingPrice: p.purchasingPrice
        };
    });

    res.json({ products: listings });
};

export const getAllProducts: RequestHandler = async (req, res) => {

    const { pageNo = "1", limit = "10" } = req.query as {
        pageNo: string;
        limit: string;
    };

    const products = await ProductModel.find().sort("-createdAt").skip((+pageNo - 1) * +limit)
        .limit(+limit);

    let count = 0;
    const listings = products.map((p) => {
        count += 1;
        return {
            id: p._id,
            name: p.name,
            thumbnail: p.thumbnail,
            category: p.category,
            price: p.price,
            purchasingPrice: p.purchasingPrice
        };
    });

    res.json({ total: count, products: listings });
};

export const getListings: RequestHandler = async (req, res) => {

    const { pageNo = "1", limit = "10" } = req.query as {
        pageNo: string;
        limit: string;
    };

    let count = 0;

    const products = await ProductModel.find({ owner: req.user.id })
        .sort("-createdAt")
        .skip((+pageNo - 1) * +limit)
        .limit(+limit);

    const listings = products.map((p) => {
        count += 1;
        return {
            id: p._id,
            name: p.name,
            thumbnail: p.thumbnail,
            category: p.category,
            price: p.price,
            purchasingPrice: p.purchasingPrice,
            image: p.images?.map((i) => i.url),
            date: p.purchasingDate,
            description: p.description,
            seller: {
                id: req.user.id,
                name: req.user.name,
                avatar: req.user.avatar,
            },
        };
    });

    res.json({ total: count, products: listings });
};

export const searchProducts: RequestHandler = async (req, res) => {
    const { name } = req.query;

    const filter: FilterQuery<ProductDocument> = {};

    if (typeof name === "string") filter.name = { $regex: new RegExp(name, "i") };

    const products = await ProductModel.find(filter).limit(50);

    res.json({
        results: products.map((product) => ({
            id: product._id,
            name: product.name,
            thumbnail: product.thumbnail,
        })),
    });
};
