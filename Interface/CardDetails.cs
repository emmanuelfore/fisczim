using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace Revmax_Interface_Promun
{
    public class CardDetails
    {
        public string Code { get; set; }
        public string Message { get; set; }
        public string QRcode { get; set; }
        public string VerificationCode { get; set; }
        public string FiscalDay { get; set; }
        public Data1 Data { get; set; }
    }

    public class Data1
    {
        public string TIN { get; set; }
        public string VAT { get; set; }
        public string CompanyName { get; set; }
        public string Address { get; set; }
        public string RegistrationNumber { get; set; }
        public string SerialNumber { get; set; }
    }

}
