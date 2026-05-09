package test.apidemo.activity;

import android.content.Context;
import android.content.res.TypedArray;
import android.util.AttributeSet;
import android.view.View;
import android.view.ViewGroup;

/* JADX INFO: loaded from: classes.dex */
public class GridMenuLayout extends ViewGroup {
    private final String TAG;
    private GridAdapter adapter;
    int colums;
    int count;
    private int mMaxChildHeight;
    private int mMaxChildWidth;
    int margin;

    public interface GridAdapter {
        int getCount();

        View getView(int i);
    }

    public interface OnItemClickListener {
        void onItemClick(View view, int i);
    }

    public GridMenuLayout(Context context, AttributeSet attrs, int defStyle) {
        super(context, attrs, defStyle);
        this.TAG = "GridMenuLayoutView";
        this.margin = 8;
        this.colums = 2;
        this.mMaxChildWidth = 0;
        this.mMaxChildHeight = 0;
        this.count = 0;
        if (attrs != null) {
            TypedArray a = getContext().obtainStyledAttributes(attrs, R.styleable.mGridLayout);
            this.colums = a.getInteger(0, 2);
            this.margin = a.getInteger(1, 5);
        }
    }

    public GridMenuLayout(Context context) {
        super(context);
        this.TAG = "GridMenuLayoutView";
        this.margin = 8;
        this.colums = 2;
        this.mMaxChildWidth = 0;
        this.mMaxChildHeight = 0;
        this.count = 0;
    }

    public GridMenuLayout(Context context, AttributeSet attrs) {
        super(context, attrs);
        this.TAG = "GridMenuLayoutView";
        this.margin = 8;
        this.colums = 2;
        this.mMaxChildWidth = 0;
        this.mMaxChildHeight = 0;
        this.count = 0;
    }

    @Override // android.view.View
    protected void onMeasure(int widthMeasureSpec, int heightMeasureSpec) {
        super.onMeasure(widthMeasureSpec, heightMeasureSpec);
        this.mMaxChildWidth = 0;
        this.mMaxChildHeight = 0;
        if (View.MeasureSpec.getMode(widthMeasureSpec) != 0) {
        }
        if (View.MeasureSpec.getMode(heightMeasureSpec) != 0) {
        }
        int childWidthMeasureSpec = View.MeasureSpec.makeMeasureSpec(View.MeasureSpec.getSize(widthMeasureSpec), 0);
        int childHeightMeasureSpec = View.MeasureSpec.makeMeasureSpec(View.MeasureSpec.getSize(heightMeasureSpec), 0);
        this.count = getChildCount();
        if (this.count == 0) {
            super.onMeasure(childWidthMeasureSpec, childHeightMeasureSpec);
            return;
        }
        for (int i = 0; i < this.count; i++) {
            View child = getChildAt(i);
            if (child.getVisibility() != 8) {
                child.measure(childWidthMeasureSpec, childHeightMeasureSpec);
                this.mMaxChildWidth = Math.max(this.mMaxChildWidth, child.getMeasuredWidth());
                this.mMaxChildHeight = Math.max(this.mMaxChildHeight, child.getMeasuredHeight());
            }
        }
        int i2 = this.mMaxChildWidth;
        setMeasuredDimension(resolveSize(i2, widthMeasureSpec), resolveSize(this.mMaxChildHeight, heightMeasureSpec));
    }

    @Override // android.view.ViewGroup, android.view.View
    protected void onLayout(boolean changed, int l, int t, int r, int b) {
        int height = b - t;
        int width = r - l;
        int rows = this.count % this.colums == 0 ? this.count / this.colums : (this.count / this.colums) + 1;
        if (this.count != 0) {
            int gridW = (width - (this.margin * (this.colums - 1))) / this.colums;
            int gridH = (height - (this.margin * rows)) / rows;
            int top = this.margin;
            int top2 = top;
            int top3 = 0;
            int left = 0;
            while (left < rows) {
                int left2 = top3;
                for (int left3 = 0; left3 < this.colums; left3++) {
                    View child = getChildAt((this.colums * left) + left3);
                    if (child != null) {
                        left2 = (left3 * gridW) + (this.margin * left3);
                        if (gridW != child.getMeasuredWidth() || gridH != child.getMeasuredHeight()) {
                            child.measure(View.MeasureSpec.makeMeasureSpec(gridW, 1073741824), View.MeasureSpec.makeMeasureSpec(gridH, 1073741824));
                        }
                        child.layout(left2, top2, left2 + gridW, top2 + gridH);
                    } else {
                        return;
                    }
                }
                top2 += this.margin + gridH;
                left++;
                top3 = left2;
            }
        }
    }

    public void setGridAdapter(GridAdapter adapter) {
        this.adapter = adapter;
        int size = adapter.getCount();
        for (int i = 0; i < size; i++) {
            addView(adapter.getView(i));
        }
    }

    public void setOnItemClickListener(final OnItemClickListener click) {
        if (this.adapter == null) {
            return;
        }
        for (int i = 0; i < this.adapter.getCount(); i++) {
            final int index = i;
            View view = getChildAt(i);
            view.setOnClickListener(new View.OnClickListener() { // from class: test.apidemo.activity.GridMenuLayout.1
                @Override // android.view.View.OnClickListener
                public void onClick(View v) {
                    click.onItemClick(v, index);
                }
            });
        }
    }
}
