using System;
using System.Collections.Generic;
using System.Configuration;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using System.Windows.Forms;


namespace Revmax_Interface_Promun
{
    internal class ReadFile
    {


        public bool CountDots(int numberOfDots, string line)
        {
            bool dots;
            int counter = 0;
            foreach (char c in line)
            {
                if (c == '.')
                    counter = counter + 1;
            }
            if (counter >= numberOfDots)
                dots = true;
            else
                dots = false;
            return dots;
        }

        public Invoice ReadInvoice(string filepath, string vatFlag, List<ReadCurrencies> CurrenciesList)
        {



            string branchName = "";
            string customerBpn = "";
            string customerName = "";
            string customerTelephoneNumber = "";
            string customerVATNumber = "";
            string customerTIN = "";
            string customerEmail = "";
            string customerAddress = "";
            string invoiceComment = "";
            string invoiceFlag = "01";
            string product = "";

            int cntinv = 0;
            int productstartline = 0;
            int productendline = 0;
            int cntr = 0;
            string quantity;
            string amount;
            string price;
            string code = "";
            int i = 0;
            string invoiceamount = "";
            string invoicetaxamount = "";
            string reason = "";
            string email = "";
            string phone = "";
            string change = "";
            string cashier = "";
            string tendered = "";
            string taxable = "";
            // string temp_product = "";
            decimal temptx = 0;
            decimal tempamount = 0;
            string InvoiceNumber = "";
            string branchname = "", currency = "";
            string currentCurrency = "";
            string tax = "";
            string VAT = "";
            StringBuilder myItemsXMLStringBuilder = new StringBuilder();
            myItemsXMLStringBuilder.Append("<ITEMS>");
            StringBuilder myCurrenciesXMLStringBuilder = new StringBuilder();
            List<item> items = new List<item>();
            // finding the area of price quantity and price
            foreach (string kline in File.ReadAllLines(filepath))
            {
                cntinv += 1;
                if (kline.Contains(ConfigurationManager.AppSettings.Get("ProductStartLine")))
                    productstartline = cntinv;

                if (kline.Contains(ConfigurationManager.AppSettings.Get("ProductEndLine")))
                    productendline = cntinv;

                for (int a = 0; a < CurrenciesList.Count; a++)
                {
                    if (kline.Contains(CurrenciesList[a].Keyword))
                        currentCurrency = CurrenciesList[a].Name;


                }

            }


            /*var textPath = "product.txt";
            StreamWriter ry = new StreamWriter(textPath);*/

            foreach (string line in File.ReadAllLines(filepath))
            {

                cntr += 1;

                if (ConfigurationManager.AppSettings.Get("MultiLineProduct") == "1")
                {

                    if ((cntr > productstartline && cntr < productendline) & CountDots(int.Parse(ConfigurationManager.AppSettings.Get("ItemDotCounter")), line) == false & line.Contains("Price") == false & line.Contains("----------") == false & line.Equals("") == false)
                    {

                        
                        // Split the line into parts by spaces
                        string[] arrayprod = line.Split(' ');

                        //Assign the first element to 'code' and clean it
                        code = arrayprod[0];
                        code = code.Replace("$", "").Replace("T1", "").Replace("Z$", "");
                        //MessageBox.Show("Code" + code);

                        // Join the rest of the array into 'product'
                        product = string.Join(" ", arrayprod.Skip(1));
                        //MessageBox.Show("Product" + product);
                        //product = line;
                        

                        //product = product + "  " + temp_product;
                        //product = $"{temp_product} {product}";
                        //product += $" {temp_product}";
                        //temp_product = "";
                        //  product = "";
                        //product = line;
                        //MessageBox.Show(line);

                        //MessageBox.Show("Product: " + product);;


                    }
                    else if ((cntr > productstartline && cntr < productendline) & CountDots(int.Parse(ConfigurationManager.AppSettings.Get("ItemDotCounter")), line) == true)
                    {

                        i += 1;
                        string[] arrayprod = line.Split(' ');
                        string tempStr = string.Join("`", arrayprod);
                        arrayprod = null;
                        arrayprod = tempStr.Split(new char[] { '`' }, StringSplitOptions.RemoveEmptyEntries);
                        //code = "00000000";
                        quantity = arrayprod[int.Parse(ConfigurationManager.AppSettings.Get("ColumnQuantityIndex"))];
                        quantity = quantity.Replace("$", "");
                        quantity = quantity.Replace(",", "");
                        quantity = quantity.Replace("-", "");
                        if (!String.IsNullOrEmpty(ConfigurationManager.AppSettings.Get("TaxSymbol")) && !String.IsNullOrEmpty(ConfigurationManager.AppSettings.Get("NonTaxSymbol")))
                        {
                            quantity = quantity.Replace(ConfigurationManager.AppSettings.Get("NonTaxSymbol"), "");
                            quantity = quantity.Replace(ConfigurationManager.AppSettings.Get("TaxSymbol"), "");
                        }
                        quantity = quantity.Trim();
                        // MessageBox.Show("quantity: "+quantity);

                        price = arrayprod[int.Parse(ConfigurationManager.AppSettings.Get("ColumnPriceIndex"))];
                        price = price.Replace("$", "");
                        price = price.Replace("$", "");
                        price = price.Replace("T1", "");
                        price = price.Replace("Z$", "");

                        if (!String.IsNullOrEmpty(ConfigurationManager.AppSettings.Get("TaxSymbol")) && !String.IsNullOrEmpty(ConfigurationManager.AppSettings.Get("NonTaxSymbol")))
                        {
                            price = price.Replace(ConfigurationManager.AppSettings.Get("NonTaxSymbol"), "");
                            price = price.Replace(ConfigurationManager.AppSettings.Get("TaxSymbol"), "");
                        }
                        price = price.Trim();
                        // MessageBox.Show("price: "+price);

                        amount = arrayprod[int.Parse(ConfigurationManager.AppSettings.Get("ColumnAmountIndex"))];
                        amount = amount.Replace("$", "");
                        amount = amount.Replace(",", "");
                        amount = amount.Replace("T", "");
                        amount = amount.Replace("US", "");
                        amount = amount.Replace("US$", "");
                        amount = amount.Replace("Z$", "");
                        amount = amount.Replace("*", "");
                        amount = amount.Replace("-", "");
                        amount = amount.Trim();
                        //  MessageBox.Show("amount: "+amount);


                        if (!String.IsNullOrEmpty(ConfigurationManager.AppSettings.Get("TaxSymbol")) && !String.IsNullOrEmpty(ConfigurationManager.AppSettings.Get("NonTaxSymbol")))
                        {
                            amount = amount.Replace(ConfigurationManager.AppSettings.Get("NonTaxSymbol"), "");
                            amount = amount.Replace(ConfigurationManager.AppSettings.Get("TaxSymbol"), "");
                        }

                        tempamount += Convert.ToDecimal(amount);

                        price = Convert.ToString(Math.Round((Convert.ToDecimal(amount) / Convert.ToDecimal(quantity)), 2));



                        if (String.IsNullOrEmpty(ConfigurationManager.AppSettings.Get("TaxSymbol")) && String.IsNullOrEmpty(ConfigurationManager.AppSettings.Get("NonTaxSymbol")))
                        {


                            VAT = ConfigurationManager.AppSettings.Get("VatA");
                            tax = VAT.ToString();

                            if (ConfigurationManager.AppSettings.Get("Vatflag") == "1")
                            {
                                taxable = "Incl";
                            }
                            else if (ConfigurationManager.AppSettings.Get("Vatflag") == "0")
                            {
                                taxable = "Excl";
                            }

                        }

                        else
                        {


                            if (!product.Contains(ConfigurationManager.AppSettings.Get("NonTaxSymbol")))
                            {

                                //code = "00000000";
                                VAT = ConfigurationManager.AppSettings.Get("VatA");
                                tax = VAT.ToString();
                                // MessageBox.Show("Taxable");

                                if (ConfigurationManager.AppSettings.Get("Vatflag") == "1")
                                {
                                    taxable = "Incl";
                                }
                                else if (ConfigurationManager.AppSettings.Get("Vatflag") == "0")
                                {
                                    taxable = "Excl";
                                }
                            }
                            else if (product.Contains(ConfigurationManager.AppSettings.Get("NonTaxSymbol")))

                            {

                                //code = "11111111";
                                VAT = ConfigurationManager.AppSettings.Get("VatE");
                                tax = VAT.ToString();
                                //MessageBox.Show("Non Taxable");
                                taxable = "Exem";
                            }





                        }

                        string taxamount = "";
                        taxamount = Convert.ToString(Math.Round((Convert.ToDecimal(amount) * Convert.ToDecimal(tax)), 2));//2.223

                        string tx = "";

                        if (ConfigurationManager.AppSettings.Get("VatFlag") == "1")
                        {
                            tx = Convert.ToString(Convert.ToDecimal(amount) - Convert.ToDecimal(amount) / (1 + Convert.ToDecimal(tax)));
                            temptx += Convert.ToDecimal(tx);
                        }
                        else if (ConfigurationManager.AppSettings.Get("VatFlag") == "0")
                            tx = taxamount;

                        //MessageBox.Show("price : " + price+ "\ntax: "+tx+"\ntax rate: " + tax+ "\ntax: "+tx);


                        product = product.Replace("!", " ").Replace("@", "").Replace("#", "").Replace("$", "").Replace("%", "").Replace("^", "").Replace("&", "").Replace("*", "").Replace("(", "").Replace(")", "").Replace("-", "").Replace("+", "").Replace("~", "").Replace("<", "").Replace(">", "").Replace("?", "").Replace("/", "").Replace(@"\", "").Replace("[", "").Replace("]", "").Replace("{", "").Replace("}", "").Replace("|", "").Replace("`", "").Trim();
                        /*temp_product = "";
                        string[] productItems = product.Split(' ');
                        foreach (var item in productItems)
                        {
                            if (double.TryParse(item, out double result))
                            {
                                code = item;
                                //MessageBox.Show($"Code:  {code}");
                            }
                        }
                        product = product.Replace(code, "");
                        // MessageBox.Show($"Product Before:  {product}");
                        string[] productItems2 = product.Split(' ');
                        product = product.Replace(productItems2[0], "");
                        product = product.Trim();
                        // MessageBox.Show($"Product After:  {product}");*/

                        items.Add(new item
                        {
                            HH = (i + 1).ToString(),
                            ITEMCODE = code,
                            ITEMNAME1 = product,
                            ITEMNAME2 = product,
                            Quantity = quantity,
                            Price = price,
                            Amount = amount,
                            Tax = tx,
                            Taxable = taxable,
                            TaxR = VAT

                        }); ;
                        ;
                        //  MessageBox.Show(myItemsXMLStringBuilder.ToString());


                        myItemsXMLStringBuilder.Append("<ITEM>");
                        myItemsXMLStringBuilder.Append("<HH>" + (i + 1).ToString() + "</HH>");
                        myItemsXMLStringBuilder.Append("<ITEMCODE>" + code + "</ITEMCODE>");
                        myItemsXMLStringBuilder.Append("<ITEMNAME1>" + product + "</ITEMNAME1>");
                        myItemsXMLStringBuilder.Append("<ITEMNAME2>" + product + "</ITEMNAME2>");
                        myItemsXMLStringBuilder.Append("<QTY>" + quantity + "</QTY>");
                        myItemsXMLStringBuilder.Append("<PRICE>" + price + "</PRICE>");
                        myItemsXMLStringBuilder.Append("<AMT>" + amount + "</AMT>");
                        myItemsXMLStringBuilder.Append("<TAX>" + tx + "</TAX>");
                        myItemsXMLStringBuilder.Append("<TAXR>" + VAT + "</TAXR>");
                        myItemsXMLStringBuilder.Append("</ITEM>");
                        product = String.Empty;
                        //  MessageBox.Show(myItemsXMLStringBuilder.ToString());
                    }



                    /*else if (line.Contains(ConfigurationManager.AppSettings.Get("InvoiceTaxAmount")) && !line.Contains("Tax 0%:") && !line.Contains("Tax No."))
                    {
                        string[] userArray;
                        userArray = line.Split(' ');
                        invoicetaxamount = userArray[userArray.Length - 1];
                        invoicetaxamount = invoicetaxamount.Replace(",", "");
                        invoicetaxamount = invoicetaxamount.Replace("x", "");
                        invoicetaxamount = invoicetaxamount.Replace("$", "");
                        invoicetaxamount = invoicetaxamount.Replace("US", "");
                        invoicetaxamount = invoicetaxamount.Replace("US$", "");
                        invoicetaxamount = invoicetaxamount.Replace("ZWL", "");
                        invoicetaxamount = invoicetaxamount.Replace("Z$", "");
                        invoicetaxamount = invoicetaxamount.Replace("Z", "");
                        invoicetaxamount = invoicetaxamount.Trim();
                        //   MessageBox.Show("tax: "+invoicetaxamount);
                    }*/
                    invoicetaxamount = temptx.ToString();

                    /*if (line.Contains(ConfigurationManager.AppSettings.Get("InvoiceAmount")) && !line.Contains("Subtotal:"))
                    {
                        string[] userArray;
                        userArray = line.Split(' ');
                        invoiceamount = userArray[userArray.Length - 1];
                        invoiceamount = invoiceamount.Replace(",", "");
                        invoiceamount = invoiceamount.Replace("$", "");
                        invoiceamount = invoiceamount.Replace("T", "");
                        invoiceamount = invoiceamount.Replace("US", "");
                        invoiceamount = invoiceamount.Replace("US$", "");
                        invoiceamount = invoiceamount.Replace("ZWL", "");
                        invoiceamount = invoiceamount.Replace("Z$", "");
                        invoiceamount = invoiceamount.Replace("Z", "");
                        invoiceamount = invoiceamount.Trim();
                        // MessageBox.Show("amount: " + invoiceamount);
                    }*/
                    invoiceamount = tempamount.ToString();

                    if (line.Contains(ConfigurationManager.AppSettings.Get("InvoiceNumber")))
                    {
                        string[] userArray;
                        userArray = line.Split(' ');
                        InvoiceNumber = userArray[userArray.Length - 1];
                        InvoiceNumber = Regex.Replace(InvoiceNumber, "[^a-zA-Z0-9]", ""); // Remove non-alphanumeric characters
                        //InvoiceNumber = "Reference" + InvoiceNumber;
                        InvoiceNumber = InvoiceNumber.Trim();
                        if (InvoiceNumber.Contains("CR"))
                        {
                            invoiceFlag = "02";
                        }
                        // MessageBox.Show("inv " + InvoiceNumber);
                    }

                    /*else if (line.Contains(ConfigurationManager.AppSettings.Get("Email")) && !line.Contains("Buyer"))
                    {
                        string[] userArray;
                        userArray = line.Split(':');
                        email = userArray[userArray.Length - 1];
                        email = email.Trim();
                        // MessageBox.Show("Email " + email);
                    }

                    else if (line.Contains(ConfigurationManager.AppSettings.Get("Phone")))
                    {
                        string[] userArray;
                        userArray = line.Split(':');
                        phone = userArray[1];
                        phone = phone.Replace("Fax", "");
                        phone = phone.Trim();
                        // MessageBox.Show("Phone " + phone);
                    }*/

                    if (line.Contains(ConfigurationManager.AppSettings.Get("Reason")))
                    {
                        string[] userArray;
                        userArray = line.Split(' ');
                        reason = userArray[userArray.Length - 1];
                        reason = reason.Trim();
                        // MessageBox.Show("Reason: " + reason);
                    }

                    else if (line.Contains(ConfigurationManager.AppSettings.Get("Change")))
                    {
                        string[] userArray;
                        userArray = line.Split(' ');
                        change = userArray[userArray.Length - 1];
                        change = change.Replace("$", "");
                        change = change.Trim();
                        // MessageBox.Show("Reason: " + reason);
                    }

                    if (line.Contains(ConfigurationManager.AppSettings.Get("Reason")))
                    {
                        string[] userArray;
                        userArray = line.Split(':');
                        reason = userArray[userArray.Length - 1];
                        reason = reason.Trim();
                        // MessageBox.Show("Reason: " + reason);
                    }

                    else if (line.Contains(ConfigurationManager.AppSettings.Get("CustomerAddress")))
                    {
                        string[] userArray;
                        userArray = line.Split(':');
                        customerAddress = userArray[userArray.Length - 1];
                        customerAddress = customerAddress.Trim();
                        // MessageBox.Show("Buyer Address: " + buyerAddress);
                    }

                    else if (line.Contains(ConfigurationManager.AppSettings.Get("CustomerName")))
                    {
                        string[] userArray;
                        userArray = line.Split(':');
                        customerName = userArray[userArray.Length - 1];
                        customerName = customerName.Trim();
                        // MessageBox.Show("Buyer Name: " + buyerTradeName);
                    }

                    else if (line.Contains(ConfigurationManager.AppSettings.Get("CustomerEmail")))
                    {
                        string[] userArray;
                        userArray = line.Split(':');
                        customerEmail = userArray[userArray.Length - 1];
                        customerEmail = customerEmail.Trim();
                        // MessageBox.Show("Buyer Email: " + buyerContacts);
                    }

                    else if (line.Contains(ConfigurationManager.AppSettings.Get("CustomerTIN")))
                    {
                        string[] userArray;
                        userArray = line.Split(':');
                        customerTIN = userArray[userArray.Length - 1];
                        customerTIN = customerTIN.Trim();
                        // MessageBox.Show("Buyer TIN: " + buyerTIN);
                    }

                    else if (line.Contains(ConfigurationManager.AppSettings.Get("Cashier")))
                    {
                        string[] userArray;
                        userArray = line.Split(':');
                        cashier = userArray[userArray.Length - 1];
                        cashier = cashier.Replace("Till", "");
                        cashier = cashier.Replace("Till:001", "");
                        cashier = cashier.Replace("Till:002", "");
                        cashier = cashier.Replace("Till:004", "");
                        cashier = cashier.Replace("Till:003", "");
                        cashier = cashier.Trim();
                        // MessageBox.Show("Phone " + phone);
                    }

                    else if (line.Contains(ConfigurationManager.AppSettings.Get("Tendered")))
                    {
                        string[] userArray;
                        userArray = line.Split(' ');
                        tendered = userArray[userArray.Length - 1];
                        tendered = tendered.Replace(",", "");
                        tendered = tendered.Replace("$", "");
                        tendered = tendered.Replace("US", "");
                        tendered = tendered.Replace("US$", "");
                        tendered = tendered.Replace("ZWL", "");
                        tendered = tendered.Replace("Z$", "");
                        tendered = tendered.Replace("Z", "");
                        tendered = tendered.Trim();
                        //    MessageBox.Show("Cashier: " + cashier);
                    }

                    else if (line.Contains(ConfigurationManager.AppSettings.Get("InvoiceComment")))
                    {
                        string[] userArray;
                        userArray = line.Split(':');
                        invoiceComment = userArray[userArray.Length - 1];
                        invoiceComment = Regex.Replace(invoiceComment, "[^a-zA-Z0-9]", ""); // Remove non-alphanumeric characters
                        invoiceComment = invoiceComment.Trim();
                        //MessageBox.Show("invoiceComment: " + invoiceComment);
                    }

                    else if (line.Contains(ConfigurationManager.AppSettings.Get("CustomerVATNumber")))
                    {
                        string[] userArray;
                        userArray = line.Split(':');
                        customerVATNumber = userArray[userArray.Length - 1];
                        customerVATNumber = customerVATNumber.Trim();
                        //MessageBox.Show("Buyer VAT: " + buyerVAT);
                    }

                    else if (line.Contains(ConfigurationManager.AppSettings.Get("CustomerTelephoneNumber")))
                    {
                        string[] userArray;
                        userArray = line.Split(':');
                        customerTelephoneNumber = userArray[userArray.Length - 1];
                        customerTelephoneNumber = customerTelephoneNumber.Trim();
                        //MessageBox.Show("Buyer VAT: " + buyerVAT);
                    }
                }
                else
                {
                    if ((cntr > productstartline && cntr < productendline) & CountDots(int.Parse(ConfigurationManager.AppSettings.Get("ItemDotCounter")), line) == true)
                    {

                        i += 1;
                        string[] arrayprod = line.Split(' ');
                        string tempStr = string.Join("`", arrayprod);
                        arrayprod = null;
                        arrayprod = tempStr.Split(new char[] { '`' }, StringSplitOptions.RemoveEmptyEntries);

                        code = ".";
                        // MessageBox.Show("code: " + code);

                        for (int m = 0; m < arrayprod.Length - 3; m++)
                        {
                            product += " " + arrayprod[m];

                        }
                        // MessageBox.Show("Product: " + product);


                        quantity = arrayprod[arrayprod.Length - int.Parse(ConfigurationManager.AppSettings.Get("ColumnQuantityIndex"))];
                        quantity = quantity.Replace("$", "");
                        quantity = quantity.Replace(",", "");

                        if (!String.IsNullOrEmpty(ConfigurationManager.AppSettings.Get("TaxSymbol")) && !String.IsNullOrEmpty(ConfigurationManager.AppSettings.Get("NonTaxSymbol")))
                        {
                            quantity = quantity.Replace(ConfigurationManager.AppSettings.Get("NonTaxSymbol"), "");
                            quantity = quantity.Replace(ConfigurationManager.AppSettings.Get("TaxSymbol"), "");
                        }


                        quantity = quantity.Trim();
                        //  MessageBox.Show("qty" + quantity);

                        price = arrayprod[arrayprod.Length - int.Parse(ConfigurationManager.AppSettings.Get("ColumnPriceIndex"))];
                          price = price.Replace("$", " ");

                          if (!String.IsNullOrEmpty(ConfigurationManager.AppSettings.Get("TaxSymbol")) && !String.IsNullOrEmpty(ConfigurationManager.AppSettings.Get("NonTaxSymbol")))
                          {
                              price = price.Replace(ConfigurationManager.AppSettings.Get("NonTaxSymbol"), "");
                              price = price.Replace(ConfigurationManager.AppSettings.Get("TaxSymbol"), "");
                          }
                          price = price.Trim();

                        //  MessageBox.Show("price" + price.ToString());



                        amount = arrayprod[arrayprod.Length - int.Parse(ConfigurationManager.AppSettings.Get("ColumnAmountIndex"))];
                        amount = amount.Replace("$", " ");
                        amount = amount.Replace(",", "");
                        amount = amount.Trim();

                        if (String.IsNullOrEmpty(ConfigurationManager.AppSettings.Get("TaxSymbol")) && String.IsNullOrEmpty(ConfigurationManager.AppSettings.Get("NonTaxSymbol")))
                        {


                            VAT = ConfigurationManager.AppSettings.Get("VatA");
                            tax = VAT.ToString();

                            if (ConfigurationManager.AppSettings.Get("Vatflag") == "1")
                            {
                                taxable = "Incl";
                            }
                            else if (ConfigurationManager.AppSettings.Get("Vatflag") == "0")
                            {
                                taxable = "Excl";
                            }

                        }

                        else
                        {


                            if (!product.Contains(ConfigurationManager.AppSettings.Get("NonTaxSymbol")))
                            {

                                //code = "00000000";
                                VAT = ConfigurationManager.AppSettings.Get("VatA");
                                tax = VAT.ToString();
                                // MessageBox.Show("Taxable");

                                if (ConfigurationManager.AppSettings.Get("Vatflag") == "1")
                                {
                                    taxable = "Incl";
                                }
                                else if (ConfigurationManager.AppSettings.Get("Vatflag") == "0")
                                {
                                    taxable = "Excl";
                                }
                            }
                            else if (product.Contains(ConfigurationManager.AppSettings.Get("NonTaxSymbol")))

                            {

                                //code = "11111111";
                                VAT = ConfigurationManager.AppSettings.Get("VatE");
                                tax = VAT.ToString();
                                //MessageBox.Show("Non Taxable");
                                taxable = "Exem";
                            }





                        }


                        string taxamount = "";
                        taxamount = Convert.ToString(Convert.ToDecimal(amount) * Convert.ToDecimal(tax));//2.223

                        string tx = "";

                        if (ConfigurationManager.AppSettings.Get("VatFlag") == "1")
                            tx = Convert.ToString(Convert.ToDecimal(amount) - Convert.ToDecimal(amount) / (1 + Convert.ToDecimal(tax)));
                        else if (ConfigurationManager.AppSettings.Get("VatFlag") == "0")
                            tx = taxamount;

                        //MessageBox.Show("price : " + price+ "\ntax: "+tx+"\ntax rate: " + tax+ "\ntax: "+tx);

                        product = product.Replace("!", " ").Replace("@", "").Replace("#", "").Replace("$", "").Replace("%", "").Replace("^", "").Replace("&", "").Replace("*", "").Replace("(", "").Replace(")", "").Replace("-", "").Replace("+", "").Replace("~", "").Replace("<", "").Replace(">", "").Replace("?", "").Replace("/", "").Replace(@"\", "").Replace("[", "").Replace("]", "").Replace("{", "").Replace("}", "").Replace("|", "").Replace("`", "").Trim();


                        items.Add(new item
                        {
                            HH = (i + 1).ToString(),
                            ITEMCODE = code,
                            ITEMNAME1 = product,
                            ITEMNAME2 = product,
                            Quantity = quantity,
                            Price = price,
                            Amount = amount,
                            Tax = tax,
                            TaxR = VAT

                        });
                        ;

                        //MessageBox.Show("Code: "  + product+  "Quantity: "  +quantity + "Price: " + price + "Amount: " + amount);
                        myItemsXMLStringBuilder.Append("<ITEM>");
                        myItemsXMLStringBuilder.Append("<HH>" + (i + 1).ToString() + "</HH>");
                        myItemsXMLStringBuilder.Append("<ITEMCODE>" + code + "</ITEMCODE>");
                        myItemsXMLStringBuilder.Append("<ITEMNAME1>" + product + "</ITEMNAME1>");
                        myItemsXMLStringBuilder.Append("<ITEMNAME2>" + product + "</ITEMNAME2>");
                        myItemsXMLStringBuilder.Append("<QTY>" + quantity + "</QTY>");
                        myItemsXMLStringBuilder.Append("<PRICE>" + price + "</PRICE>");
                        myItemsXMLStringBuilder.Append("<AMT>" + amount + "</AMT>");
                        myItemsXMLStringBuilder.Append("<TAX>" + tx + "</TAX>");
                        myItemsXMLStringBuilder.Append("<TAXR>" + VAT + "</TAXR>");
                        myItemsXMLStringBuilder.Append("</ITEM>");

                        product = "";
                        //  MessageBox.Show(myItemsXMLStringBuilder.ToString());

                    }


                    invoicetaxamount = temptx.ToString();

                    /*if (line.Contains(ConfigurationManager.AppSettings.Get("InvoiceAmount")) && !line.Contains("Subtotal:"))
                    {
                        string[] userArray;
                        userArray = line.Split(' ');
                        invoiceamount = userArray[userArray.Length - 1];
                        invoiceamount = invoiceamount.Replace(",", "");
                        invoiceamount = invoiceamount.Replace("$", "");
                        invoiceamount = invoiceamount.Replace("T", "");
                        invoiceamount = invoiceamount.Replace("US", "");
                        invoiceamount = invoiceamount.Replace("US$", "");
                        invoiceamount = invoiceamount.Replace("ZWL", "");
                        invoiceamount = invoiceamount.Replace("Z$", "");
                        invoiceamount = invoiceamount.Replace("Z", "");
                        invoiceamount = invoiceamount.Trim();
                        // MessageBox.Show("amount: " + invoiceamount);
                    }*/
                    invoiceamount = tempamount.ToString();

                    if (line.Contains(ConfigurationManager.AppSettings.Get("InvoiceNumber")))
                    {
                        string[] userArray;
                        userArray = line.Split(' ');
                        InvoiceNumber = userArray[userArray.Length - 1];
                        InvoiceNumber = Regex.Replace(InvoiceNumber, "[^a-zA-Z0-9]", ""); // Remove non-alphanumeric characters
                        InvoiceNumber = InvoiceNumber.Trim();
                        if (InvoiceNumber.Contains("CR"))
                        {
                            invoiceFlag = "02";
                        }
                        // MessageBox.Show("inv " + InvoiceNumber);
                    }

                    /*else if (line.Contains(ConfigurationManager.AppSettings.Get("Email")) && !line.Contains("Buyer"))
                    {
                        string[] userArray;
                        userArray = line.Split(':');
                        email = userArray[userArray.Length - 1];
                        email = email.Trim();
                        // MessageBox.Show("Email " + email);
                    }

                    else if (line.Contains(ConfigurationManager.AppSettings.Get("Phone")))
                    {
                        string[] userArray;
                        userArray = line.Split(':');
                        phone = userArray[suerArray.Length - 1];
                        phone = phone.Replace("Fax", "");
                        phone = phone.Trim();
                        // MessageBox.Show("Phone " + phone);
                    }*/

                    if (line.Contains(ConfigurationManager.AppSettings.Get("Reason")))
                    {
                        string[] userArray;
                        userArray = line.Split(' ');
                        reason = userArray[userArray.Length - 1];
                        reason = reason.Trim();
                        // MessageBox.Show("Reason: " + reason);
                    }

                    else if (line.Contains(ConfigurationManager.AppSettings.Get("CustomerAddress")))
                    {
                        string[] userArray;
                        userArray = line.Split(':');
                        customerAddress = userArray[userArray.Length - 1];
                        customerAddress = customerAddress.Trim();
                        // MessageBox.Show("Buyer Address: " + buyerAddress);
                    }

                    else if (line.Contains(ConfigurationManager.AppSettings.Get("CustomerName")))
                    {
                        string[] userArray;
                        userArray = line.Split(':');
                        customerName = userArray[userArray.Length - 1];
                        customerName = customerName.Trim();
                        // MessageBox.Show("Buyer Name: " + buyerTradeName);
                    }

                    else if (line.Contains(ConfigurationManager.AppSettings.Get("CustomerEmail")))
                    {
                        string[] userArray;
                        userArray = line.Split(':');
                        customerEmail = userArray[userArray.Length - 1];
                        customerEmail = customerEmail.Trim();
                        // MessageBox.Show("Buyer Email: " + buyerContacts);
                    }

                    else if (line.Contains(ConfigurationManager.AppSettings.Get("CustomerTIN")))
                    {
                        string[] userArray;
                        userArray = line.Split(':');
                        customerTIN = userArray[userArray.Length - 1];
                        customerTIN = customerTIN.Trim();
                        // MessageBox.Show("Buyer TIN: " + buyerTIN);
                    }

                    else if (line.Contains(ConfigurationManager.AppSettings.Get("CustomerVATNumber")))
                    {
                        string[] userArray;
                        userArray = line.Split(':');
                        customerVATNumber = userArray[userArray.Length - 1];
                        customerVATNumber = customerVATNumber.Trim();
                        //MessageBox.Show("Buyer VAT: " + buyerVAT);
                    }

                    else if (line.Contains(ConfigurationManager.AppSettings.Get("CustomerTelephoneNumber")))
                    {
                        string[] userArray;
                        userArray = line.Split(':');
                        customerTelephoneNumber = userArray[userArray.Length - 1];
                        customerTelephoneNumber = customerTelephoneNumber.Trim();
                        //MessageBox.Show("Buyer VAT: " + buyerVAT);
                    }
                    

                }

            }
            myItemsXMLStringBuilder.Append("</ITEMS>");


            myCurrenciesXMLStringBuilder.Append("<CurrenciesReceived>");
            myCurrenciesXMLStringBuilder.Append("<Currency>");
            myCurrenciesXMLStringBuilder.Append("<Name>" + currentCurrency + "</Name>");
            myCurrenciesXMLStringBuilder.Append("<Amount>" + invoiceamount + "</Amount>");
            myCurrenciesXMLStringBuilder.Append("<Rate>" + "1" + "</Rate>");
            myCurrenciesXMLStringBuilder.Append("</Currency>");
            myCurrenciesXMLStringBuilder.Append("</CurrenciesReceived>");
            // MessageBox.Show(myCurrenciesXMLStringBuilder.ToString());


            Invoice invoice = new Invoice();
            invoice.InvoiceNumber = InvoiceNumber;
            invoice.InvoiceTaxAmount = invoicetaxamount;
            invoice.InvoiceAmount = invoiceamount;
            invoice.Tendered = tendered;
            invoice.Phone = phone;
            invoice.Email = email;
            invoice.Change = change;
            invoice.Reason = reason;
            invoice.Cashier = cashier;
            invoice.CustomerName = customerName;
            invoice.CustomerVATNumber = customerVATNumber;
            invoice.CustomerEmail = customerEmail;
            invoice.CustomerTIN = customerTIN;
            invoice.CustomerAddress = customerAddress;
            invoice.BranchName = branchName;
            invoice.Currency = currentCurrency;
            invoice.ItemsXML = myItemsXMLStringBuilder.ToString();
            invoice.CurrenciesXML = myCurrenciesXMLStringBuilder.ToString();
            invoice.CustomerBPN = customerBpn;
            invoice.CustomerTelephoneNumber = customerTelephoneNumber;
            invoice.InvoiceComment = invoiceComment;
            invoice.InvoiceFlag = invoiceFlag;
            invoice.items = items;

            return invoice;



        }




    }
}
