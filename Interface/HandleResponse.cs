using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using System.Windows.Forms;
using System.Xml;
using System.Xml.Linq;

namespace Revmax_Interface_Promun
{
    internal class HandleResponse
    {
        public RootObject ResponseHandler(string j)
        {
            return (RootObject)JsonConvert.DeserializeObject<RootObject>(j);
        }


    }
}
