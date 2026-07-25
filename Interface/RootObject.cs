using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace Revmax_Interface_Promun
{
    public class RootObject
    {
        public string Code { get; set; }
        public string Message { get; set; }
        public string QRcode { get; set; }
        public string VerificationCode { get; set; }
        public string FiscalDay { get; set; }
        public string DeviceId { get; set; }
        public Data Data { get; set; }
    }

    public class Data
    {
        //public CardDetails Card { get; set; }
        public Receipt Receipt { get; set; }
    }
}
