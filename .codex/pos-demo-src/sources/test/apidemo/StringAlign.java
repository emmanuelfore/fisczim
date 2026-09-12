package test.apidemo;

/* JADX INFO: loaded from: classes.dex */
public class StringAlign {
    public static final int JUST_CENTER = 1;
    public static final int JUST_LEFT = 0;
    public static final int JUST_RIGHT = 2;
    private int just;
    private int maxChars;

    public StringAlign() {
        this.just = 1;
        this.maxChars = 80;
    }

    public StringAlign(int maxChars, int just) {
        this();
        setJust(just);
        setMaxChars(maxChars);
    }

    public String format(String s) {
        StringBuffer where = new StringBuffer();
        int wantedLength = Math.min(s.length(), this.maxChars);
        String wanted = s.substring(0, wantedLength);
        switch (this.just) {
            case 0:
                where.append(wanted);
                pad(where, this.maxChars - wantedLength);
                break;
            case 1:
                int startPos = where.length();
                pad(where, (this.maxChars - wantedLength) / 2);
                where.append(wanted);
                pad(where, (this.maxChars - wantedLength) / 2);
                pad(where, this.maxChars - (where.length() - startPos));
                break;
            case 2:
                pad(where, this.maxChars - wantedLength);
                where.append(wanted);
                break;
        }
        if (s.length() > wantedLength) {
            String remainStr = s.substring(wantedLength);
            where.append("\n" + format(remainStr));
        }
        String remainStr2 = where.toString();
        return remainStr2;
    }

    protected final void pad(StringBuffer to, int howMany) {
        for (int i = 0; i < howMany; i++) {
            to.append(" ");
        }
    }

    public int getJust() {
        return this.just;
    }

    public void setJust(int just) {
        switch (just) {
            case 0:
            case 1:
            case 2:
                this.just = just;
                break;
            default:
                System.out.println("invalid justification arg.");
                break;
        }
    }

    public int getMaxChars() {
        return this.maxChars;
    }

    public void setMaxChars(int maxChars) {
        if (maxChars < 0) {
            System.out.println("maxChars must be positive.");
        } else {
            this.maxChars = maxChars;
        }
    }
}
