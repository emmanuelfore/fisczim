package com.google.zxing.client.result;

import com.google.zxing.Result;
import java.io.ByteArrayOutputStream;
import java.io.UnsupportedEncodingException;
import java.nio.charset.Charset;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Iterator;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/* JADX INFO: loaded from: classes.dex */
public final class VCardResultParser extends ResultParser {
    private static final Pattern BEGIN_VCARD = Pattern.compile("BEGIN:VCARD", 2);
    private static final Pattern VCARD_LIKE_DATE = Pattern.compile("\\d{4}-?\\d{2}-?\\d{2}");
    private static final Pattern CR_LF_SPACE_TAB = Pattern.compile("\r\n[ \t]");
    private static final Pattern NEWLINE_ESCAPE = Pattern.compile("\\\\[nN]");
    private static final Pattern VCARD_ESCAPES = Pattern.compile("\\\\([,;\\\\])");
    private static final Pattern EQUALS = Pattern.compile("=");
    private static final Pattern SEMICOLON = Pattern.compile(";");
    private static final Pattern UNESCAPED_SEMICOLONS = Pattern.compile("(?<!\\\\);+");
    private static final Pattern COMMA = Pattern.compile(",");
    private static final Pattern SEMICOLON_OR_COMMA = Pattern.compile("[;,]");

    @Override // com.google.zxing.client.result.ResultParser
    public AddressBookParsedResult parse(Result result) {
        String rawText = getMassagedText(result);
        Matcher m = BEGIN_VCARD.matcher(rawText);
        if (!m.find() || m.start() != 0) {
            return null;
        }
        List<List<String>> listMatchVCardPrefixedField = matchVCardPrefixedField("FN", rawText, true, false);
        List<List<String>> names = listMatchVCardPrefixedField;
        if (listMatchVCardPrefixedField == null) {
            List<List<String>> listMatchVCardPrefixedField2 = matchVCardPrefixedField("N", rawText, true, false);
            names = listMatchVCardPrefixedField2;
            formatNames(listMatchVCardPrefixedField2);
        }
        List<String> nicknameString = matchSingleVCardPrefixedField("NICKNAME", rawText, true, false);
        String[] nicknames = nicknameString == null ? null : COMMA.split(nicknameString.get(0));
        List<List<String>> phoneNumbers = matchVCardPrefixedField("TEL", rawText, true, false);
        List<List<String>> emails = matchVCardPrefixedField("EMAIL", rawText, true, false);
        List<String> note = matchSingleVCardPrefixedField("NOTE", rawText, false, false);
        List<List<String>> addresses = matchVCardPrefixedField("ADR", rawText, true, true);
        List<String> org = matchSingleVCardPrefixedField("ORG", rawText, true, true);
        List<String> listMatchSingleVCardPrefixedField = matchSingleVCardPrefixedField("BDAY", rawText, true, false);
        List<String> birthday = listMatchSingleVCardPrefixedField;
        if (listMatchSingleVCardPrefixedField != null && !isLikeVCardDate(birthday.get(0))) {
            birthday = null;
        }
        List<String> birthday2 = birthday;
        List<String> title = matchSingleVCardPrefixedField("TITLE", rawText, true, false);
        List<List<String>> urls = matchVCardPrefixedField("URL", rawText, true, false);
        List<String> instantMessenger = matchSingleVCardPrefixedField("IMPP", rawText, true, false);
        List<String> geoString = matchSingleVCardPrefixedField("GEO", rawText, true, false);
        String[] strArrSplit = geoString == null ? null : SEMICOLON_OR_COMMA.split(geoString.get(0));
        String[] geo = strArrSplit;
        if (strArrSplit != null && geo.length != 2) {
            geo = null;
        }
        return new AddressBookParsedResult(toPrimaryValues(names), nicknames, null, toPrimaryValues(phoneNumbers), toTypes(phoneNumbers), toPrimaryValues(emails), toTypes(emails), toPrimaryValue(instantMessenger), toPrimaryValue(note), toPrimaryValues(addresses), toTypes(addresses), toPrimaryValue(org), toPrimaryValue(birthday2), toPrimaryValue(title), toPrimaryValues(urls), geo);
    }

    static List<List<String>> matchVCardPrefixedField(CharSequence prefix, String rawText, boolean trim, boolean parseFieldDivider) {
        int i;
        int matchStart;
        int i2;
        String element;
        int i3;
        Matcher matcher;
        List<List<String>> matches = null;
        int i4 = 0;
        int max = rawText.length();
        String[] strArr = null;
        while (i4 < max) {
            Matcher matcher2 = Pattern.compile("(?:^|\n)" + ((Object) prefix) + "(?:;([^:]*))?:", 2).matcher(rawText);
            if (i4 > 0) {
                i4--;
            }
            if (!matcher2.find(i4)) {
                break;
            }
            int i5 = matcher2.end(0);
            String metadataString = matcher2.group(1);
            List<String> metadata = null;
            boolean quotedPrintable = false;
            String quotedPrintableCharset = null;
            if (metadataString != null) {
                String[] strArrSplit = SEMICOLON.split(metadataString);
                int length = strArrSplit.length;
                String quotedPrintableCharset2 = null;
                boolean quotedPrintable2 = false;
                String[] metadatumTokens = strArr;
                int i6 = 0;
                while (i6 < length) {
                    String metadatum = strArrSplit[i6];
                    if (metadata == null) {
                        i3 = i5;
                        matcher = matcher2;
                        metadata = new ArrayList<>(1);
                    } else {
                        i3 = i5;
                        matcher = matcher2;
                    }
                    metadata.add(metadatum);
                    String[] strArrSplit2 = EQUALS.split(metadatum, 2);
                    metadatumTokens = strArrSplit2;
                    if (strArrSplit2.length > 1) {
                        String key = metadatumTokens[0];
                        String value = metadatumTokens[1];
                        if ("ENCODING".equalsIgnoreCase(key) && "QUOTED-PRINTABLE".equalsIgnoreCase(value)) {
                            quotedPrintable2 = true;
                        } else if ("CHARSET".equalsIgnoreCase(key)) {
                            quotedPrintableCharset2 = value;
                        }
                    }
                    i6++;
                    i5 = i3;
                    matcher2 = matcher;
                }
                i = i5;
                strArr = metadatumTokens;
                quotedPrintable = quotedPrintable2;
                quotedPrintableCharset = quotedPrintableCharset2;
            } else {
                i = i5;
            }
            int i7 = i;
            while (true) {
                matchStart = i;
                int iIndexOf = rawText.indexOf(10, i7);
                i2 = iIndexOf;
                if (iIndexOf < 0) {
                    break;
                }
                if (i2 < rawText.length() - 1 && (rawText.charAt(i2 + 1) == ' ' || rawText.charAt(i2 + 1) == '\t')) {
                    i7 = i2 + 2;
                } else {
                    if (!quotedPrintable || ((i2 <= 0 || rawText.charAt(i2 - 1) != '=') && (i2 < 2 || rawText.charAt(i2 - 2) != '='))) {
                        break;
                    }
                    i7 = i2 + 1;
                }
                i = matchStart;
            }
            if (i2 < 0) {
                i4 = max;
            } else if (i2 > matchStart) {
                if (matches == null) {
                    matches = new ArrayList<>(1);
                }
                if (i2 > 0 && rawText.charAt(i2 - 1) == '\r') {
                    i2--;
                }
                String element2 = rawText.substring(matchStart, i2);
                if (trim) {
                    element2 = element2.trim();
                }
                if (quotedPrintable) {
                    element = decodeQuotedPrintable(element2, quotedPrintableCharset);
                    if (parseFieldDivider) {
                        element = UNESCAPED_SEMICOLONS.matcher(element).replaceAll("\n").trim();
                    }
                } else {
                    if (parseFieldDivider) {
                        element2 = UNESCAPED_SEMICOLONS.matcher(element2).replaceAll("\n").trim();
                    }
                    element = VCARD_ESCAPES.matcher(NEWLINE_ESCAPE.matcher(CR_LF_SPACE_TAB.matcher(element2).replaceAll("")).replaceAll("\n")).replaceAll("$1");
                }
                if (metadata == null) {
                    List<String> match = new ArrayList<>(1);
                    match.add(element);
                    matches.add(match);
                } else {
                    metadata.add(0, element);
                    matches.add(metadata);
                }
                i4 = i2 + 1;
            } else {
                i4 = i2 + 1;
            }
        }
        return matches;
    }

    private static String decodeQuotedPrintable(CharSequence value, String charset) {
        char nextChar;
        int length = value.length();
        StringBuilder result = new StringBuilder(length);
        ByteArrayOutputStream fragmentBuffer = new ByteArrayOutputStream();
        int i = 0;
        while (i < length) {
            char c = value.charAt(i);
            if (c != '\n' && c != '\r') {
                if (c == '=') {
                    if (i < length - 2 && (nextChar = value.charAt(i + 1)) != '\r' && nextChar != '\n') {
                        char nextNextChar = value.charAt(i + 2);
                        int firstDigit = parseHexDigit(nextChar);
                        int secondDigit = parseHexDigit(nextNextChar);
                        if (firstDigit >= 0 && secondDigit >= 0) {
                            fragmentBuffer.write((firstDigit << 4) + secondDigit);
                        }
                        i += 2;
                    }
                } else {
                    maybeAppendFragment(fragmentBuffer, charset, result);
                    result.append(c);
                }
            }
            i++;
        }
        maybeAppendFragment(fragmentBuffer, charset, result);
        return result.toString();
    }

    private static void maybeAppendFragment(ByteArrayOutputStream fragmentBuffer, String charset, StringBuilder result) {
        String fragment;
        if (fragmentBuffer.size() > 0) {
            byte[] fragmentBytes = fragmentBuffer.toByteArray();
            if (charset == null) {
                fragment = new String(fragmentBytes, Charset.forName("UTF-8"));
            } else {
                try {
                    fragment = new String(fragmentBytes, charset);
                } catch (UnsupportedEncodingException e) {
                    fragment = new String(fragmentBytes, Charset.forName("UTF-8"));
                }
            }
            fragmentBuffer.reset();
            result.append(fragment);
        }
    }

    static List<String> matchSingleVCardPrefixedField(CharSequence prefix, String rawText, boolean trim, boolean parseFieldDivider) {
        List<List<String>> values = matchVCardPrefixedField(prefix, rawText, trim, parseFieldDivider);
        if (values == null || values.isEmpty()) {
            return null;
        }
        return values.get(0);
    }

    private static String toPrimaryValue(List<String> list) {
        if (list == null || list.isEmpty()) {
            return null;
        }
        return list.get(0);
    }

    private static String[] toPrimaryValues(Collection<List<String>> lists) {
        if (lists == null || lists.isEmpty()) {
            return null;
        }
        List<String> result = new ArrayList<>(lists.size());
        Iterator<List<String>> it = lists.iterator();
        while (it.hasNext()) {
            String value = it.next().get(0);
            if (value != null && !value.isEmpty()) {
                result.add(value);
            }
        }
        return (String[]) result.toArray(new String[lists.size()]);
    }

    private static String[] toTypes(Collection<List<String>> lists) {
        if (lists == null || lists.isEmpty()) {
            return null;
        }
        List<String> result = new ArrayList<>(lists.size());
        for (List<String> list : lists) {
            String type = null;
            int i = 1;
            while (true) {
                if (i >= list.size()) {
                    break;
                }
                String metadatum = list.get(i);
                int equals = metadatum.indexOf(61);
                if (equals < 0) {
                    type = metadatum;
                    break;
                }
                if (!"TYPE".equalsIgnoreCase(metadatum.substring(0, equals))) {
                    i++;
                } else {
                    type = metadatum.substring(equals + 1);
                    break;
                }
            }
            result.add(type);
        }
        return (String[]) result.toArray(new String[lists.size()]);
    }

    private static boolean isLikeVCardDate(CharSequence value) {
        return value == null || VCARD_LIKE_DATE.matcher(value).matches();
    }

    private static void formatNames(Iterable<List<String>> names) {
        int end;
        if (names != null) {
            for (List<String> list : names) {
                String name = list.get(0);
                String[] components = new String[5];
                int start = 0;
                int start2 = 0;
                while (start2 < 4 && (end = name.indexOf(59, start)) >= 0) {
                    components[start2] = name.substring(start, end);
                    start2++;
                    start = end + 1;
                }
                components[start2] = name.substring(start);
                StringBuilder newName = new StringBuilder(100);
                maybeAppendComponent(components, 3, newName);
                maybeAppendComponent(components, 1, newName);
                maybeAppendComponent(components, 2, newName);
                maybeAppendComponent(components, 0, newName);
                maybeAppendComponent(components, 4, newName);
                list.set(0, newName.toString().trim());
            }
        }
    }

    private static void maybeAppendComponent(String[] components, int i, StringBuilder newName) {
        if (components[i] != null && !components[i].isEmpty()) {
            if (newName.length() > 0) {
                newName.append(' ');
            }
            newName.append(components[i]);
        }
    }
}
