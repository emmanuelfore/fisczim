package android.support.v4.widget;

import android.content.res.ColorStateList;
import android.graphics.PorterDuff;
import android.widget.ImageView;

/* JADX INFO: loaded from: classes.dex */
class ImageViewCompatBase {
    ImageViewCompatBase() {
    }

    /* JADX WARN: Multi-variable type inference failed */
    static ColorStateList getImageTintList(ImageView imageView) {
        if (imageView instanceof TintableImageSourceView) {
            return ((TintableImageSourceView) imageView).getSupportImageTintList();
        }
        return null;
    }

    /* JADX WARN: Multi-variable type inference failed */
    static void setImageTintList(ImageView imageView, ColorStateList tintList) {
        if (imageView instanceof TintableImageSourceView) {
            ((TintableImageSourceView) imageView).setSupportImageTintList(tintList);
        }
    }

    /* JADX WARN: Multi-variable type inference failed */
    static PorterDuff.Mode getImageTintMode(ImageView imageView) {
        if (imageView instanceof TintableImageSourceView) {
            return ((TintableImageSourceView) imageView).getSupportImageTintMode();
        }
        return null;
    }

    /* JADX WARN: Multi-variable type inference failed */
    static void setImageTintMode(ImageView imageView, PorterDuff.Mode mode) {
        if (imageView instanceof TintableImageSourceView) {
            ((TintableImageSourceView) imageView).setSupportImageTintMode(mode);
        }
    }
}
