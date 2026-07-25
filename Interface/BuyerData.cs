using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace Revmax_Interface_Promun
{
    public class BuyerData
    {
        public string buyerRegisterName { get; set; }
        public string buyerTradeName { get; set; }
        public string buyerTIN { get; set; }
        public string buyerVAT { get; set; }
        public string VATNumber { get; set; }
        public BuyerContacts buyerContacts { get; set; }
        public BuyerAddress buyerAddress { get; set; }

    }

    public class BuyerContacts
    {
        public string phoneNo { get; set; }
        public string email { get; set; }

    }
    public class BuyerAddress
    {
          public string province{ get; set; }
          public string street  { get; set; }
          public string houseNo { get; set; }
          public string city { get; set; }

    }
}
