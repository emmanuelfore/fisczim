package android.support.v4.widget;

import android.content.res.ColorStateList;
import android.graphics.PorterDuff;
import android.graphics.drawable.Drawable;
import android.os.Build;
import android.support.annotation.RequiresApi;
import android.support.v4.view.MotionEventCompat;
import android.widget.ImageView;

/* JADX INFO: loaded from: classes.dex */
@RequiresApi(MotionEventCompat.AXIS_WHEEL)
class ImageViewCompatLollipop {
    ImageViewCompatLollipop() {
    }

    static ColorStateList getImageTintList(ImageView view) {
        return view.getImageTintList();
    }

    static void setImageTintList(ImageView view, ColorStateList tintList) {
        view.setImageTintList(tintList);
        if (Build.VERSION.SDK_INT == 21) {
            Drawable imageViewDrawable = view.getDrawable();
            boolean hasTint = (view.getImageTintList() == null || view.getImageTintMode() == null) ? false : true;
            if (imageViewDrawable != null && hasTint) {
                if (imageViewDrawable.isStateful()) {
                    imageViewDrawable.setState(view.getDrawableState());
                }
                view.setImageDrawable(imageViewDrawable);
            }
        }
    }

    static PorterDuff.Mode getImageTintMode(ImageView view) {
        return view.getImageTintMode();
    }

    static void setImageTintMode(ImageView view, PorterDuff.Mode mode) {
        view.setImageTintMode(mode);
        if (Build.VERSION.SDK_INT == 21) {
            Drawable imageViewDrawable = view.getDrawable();
            boolean hasTint = (view.getImageTintList() == null || view.getImageTintMode() == null) ? false : true;
            if (imageViewDrawable != null && hasTint) {
                if (imageViewDrawable.isStateful()) {
                    imageViewDrawable.setState(view.getDrawableState());
                }
                view.setImageDrawable(imageViewDrawable);
            }
        }
    }
}
