package android.support.v4.widget;

import android.content.res.ColorStateList;
import android.graphics.PorterDuff;
import android.os.Build;
import android.widget.ImageView;

/* JADX INFO: loaded from: classes.dex */
public class ImageViewCompat {
    static final ImageViewCompatImpl IMPL;

    interface ImageViewCompatImpl {
        ColorStateList getImageTintList(ImageView imageView);

        PorterDuff.Mode getImageTintMode(ImageView imageView);

        void setImageTintList(ImageView imageView, ColorStateList colorStateList);

        void setImageTintMode(ImageView imageView, PorterDuff.Mode mode);
    }

    static class BaseViewCompatImpl implements ImageViewCompatImpl {
        BaseViewCompatImpl() {
        }

        @Override // android.support.v4.widget.ImageViewCompat.ImageViewCompatImpl
        public ColorStateList getImageTintList(ImageView view) {
            return ImageViewCompatBase.getImageTintList(view);
        }

        @Override // android.support.v4.widget.ImageViewCompat.ImageViewCompatImpl
        public void setImageTintList(ImageView view, ColorStateList tintList) {
            ImageViewCompatBase.setImageTintList(view, tintList);
        }

        @Override // android.support.v4.widget.ImageViewCompat.ImageViewCompatImpl
        public void setImageTintMode(ImageView view, PorterDuff.Mode mode) {
            ImageViewCompatBase.setImageTintMode(view, mode);
        }

        @Override // android.support.v4.widget.ImageViewCompat.ImageViewCompatImpl
        public PorterDuff.Mode getImageTintMode(ImageView view) {
            return ImageViewCompatBase.getImageTintMode(view);
        }
    }

    static class LollipopViewCompatImpl extends BaseViewCompatImpl {
        LollipopViewCompatImpl() {
        }

        @Override // android.support.v4.widget.ImageViewCompat.BaseViewCompatImpl, android.support.v4.widget.ImageViewCompat.ImageViewCompatImpl
        public ColorStateList getImageTintList(ImageView view) {
            return ImageViewCompatLollipop.getImageTintList(view);
        }

        @Override // android.support.v4.widget.ImageViewCompat.BaseViewCompatImpl, android.support.v4.widget.ImageViewCompat.ImageViewCompatImpl
        public void setImageTintList(ImageView view, ColorStateList tintList) {
            ImageViewCompatLollipop.setImageTintList(view, tintList);
        }

        @Override // android.support.v4.widget.ImageViewCompat.BaseViewCompatImpl, android.support.v4.widget.ImageViewCompat.ImageViewCompatImpl
        public void setImageTintMode(ImageView view, PorterDuff.Mode mode) {
            ImageViewCompatLollipop.setImageTintMode(view, mode);
        }

        @Override // android.support.v4.widget.ImageViewCompat.BaseViewCompatImpl, android.support.v4.widget.ImageViewCompat.ImageViewCompatImpl
        public PorterDuff.Mode getImageTintMode(ImageView view) {
            return ImageViewCompatLollipop.getImageTintMode(view);
        }
    }

    static {
        if (Build.VERSION.SDK_INT >= 21) {
            IMPL = new LollipopViewCompatImpl();
        } else {
            IMPL = new BaseViewCompatImpl();
        }
    }

    public static ColorStateList getImageTintList(ImageView view) {
        return IMPL.getImageTintList(view);
    }

    public static void setImageTintList(ImageView view, ColorStateList tintList) {
        IMPL.setImageTintList(view, tintList);
    }

    public static PorterDuff.Mode getImageTintMode(ImageView view) {
        return IMPL.getImageTintMode(view);
    }

    public static void setImageTintMode(ImageView view, PorterDuff.Mode mode) {
        IMPL.setImageTintMode(view, mode);
    }

    private ImageViewCompat() {
    }
}
