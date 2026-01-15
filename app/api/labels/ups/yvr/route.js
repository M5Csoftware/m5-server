// app/api/labels/ups/route.js
import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import Shipment from "@/app/model/portal/Shipment";
import CustomerAccount from "@/app/model/CustomerAccount";
import ChildShipment from "@/app/model/portal/ChildShipment";
import axios from "axios";

// UPS API Configuration
const UPS_CLIENT_ID = "7kJ9GcZKiXV99sbKdIon6QxpPducB2A3aTLzHNAHx11LBJvz";
const UPS_CLIENT_SECRET =
  "rA2taqryAka2Kx2aGjcrM9FuDIGYl9MYFS3jn67bfo0DyFzvSqgCOP7hrG9TAc4G";
const UPS_ACCOUNT_NUMBER = "0V1Y57";

const UPS_AUTH_URL = "https://onlinetools.ups.com/security/v1/oauth/token";
const UPS_SHIP_URL = "https://onlinetools.ups.com/api/shipments/v1/ship";

// Get UPS OAuth Token
async function getUPSToken() {
  try {
    const auth = Buffer.from(`${UPS_CLIENT_ID}:${UPS_CLIENT_SECRET}`).toString(
      "base64"
    );

    const response = await axios.post(
      UPS_AUTH_URL,
      "grant_type=client_credentials",
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${auth}`,
        },
      }
    );

    console.log("UPS Token obtained successfully");
    return response.data.access_token;
  } catch (error) {
    console.error(
      "UPS Token Error:",
      JSON.stringify(error.response?.data, null, 2)
    );
    throw new Error(
      "Failed to get UPS access token: " +
        (error.response?.data?.error_description || error.message)
    );
  }
}

// Search Shipment Endpoint (GET)
export async function GET(request) {
  try {
    await connectDB();

    const { searchParams } = new URL(request.url);
    const awbNo = searchParams.get("awbNo");

    if (!awbNo) {
      return NextResponse.json(
        { success: false, message: "AWB Number is required" },
        { status: 400 }
      );
    }

    const shipment = await Shipment.findOne({ awbNo: awbNo.toUpperCase() });

    if (!shipment) {
      return NextResponse.json(
        { success: false, message: "Shipment not found" },
        { status: 404 }
      );
    }

    const customer = await CustomerAccount.findOne({
      accountCode: shipment.accountCode,
    });

    const childShipments = await ChildShipment.find({
      masterAwbNo: awbNo.toUpperCase(),
    });

    let hasChildNumbers = false;
    let childNumberCount = 0;

    if (
      shipment.shipmentAndPackageDetails &&
      Array.isArray(shipment.shipmentAndPackageDetails)
    ) {
      shipment.shipmentAndPackageDetails.forEach((detail) => {
        if (Array.isArray(detail)) {
          detail.forEach((item) => {
            if (item.childNo) {
              hasChildNumbers = true;
              childNumberCount++;
            }
          });
        }
      });
    }

    if (!hasChildNumbers && childShipments.length > 0) {
      hasChildNumbers = true;
      childNumberCount = childShipments.length;
    }

    const needsChildNo = shipment.pcs > 1 && !hasChildNumbers;

    return NextResponse.json({
      success: true,
      data: {
        ...shipment.toObject(),
        customer: customer?.name || "",
        needsChildNo: needsChildNo,
        hasChildNumbers: hasChildNumbers,
        date: shipment.createdAt,
        childNumberCount: childNumberCount,
        childShipments: childShipments,
      },
    });
  } catch (error) {
    console.error("Search Shipment Error:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}

// Helper function to create a single UPS label
async function createSingleUPSLabel(
  accessToken,
  shipmentData,
  packageData,
  awbNo,
  childAwbNo = null
) {
  const {
    shipperName,
    shipperContactPerson,
    shipperPhone,
    shipperAddressLine1,
    shipperAddressLine2,
    shipperCity,
    shipperProvince,
    shipperPostalCode,
    shipperCountry,
    receiverName,
    receiverPhone,
    receiverAddressLine1,
    receiverAddressLine2,
    receiverCity,
    receiverState,
    receiverPostalCode,
    destinationCountry,
    serviceCode,
    serviceDescription,
    description,
  } = shipmentData;

  const upsRequest = {
    ShipmentRequest: {
      Request: {
        SubVersion: "1801",
        RequestOption: "nonvalidate",
        TransactionReference: {
          CustomerContext: childAwbNo || awbNo,
        },
      },
      Shipment: {
        Description: description,
        Shipper: {
          Name: shipperName.slice(0, 35),
          AttentionName: shipperContactPerson.slice(0, 35),
          TaxIdentificationNumber: "",
          Phone: {
            Number: shipperPhone,
          },
          ShipperNumber: UPS_ACCOUNT_NUMBER,
          Address: {
            AddressLine: [
              shipperAddressLine1.slice(0, 35),
              shipperAddressLine2.slice(0, 35),
            ].filter(Boolean),
            City: shipperCity.slice(0, 30),
            StateProvinceCode: shipperProvince,
            PostalCode: shipperPostalCode,
            CountryCode: shipperCountry,
          },
        },
        ShipTo: {
          Name: receiverName.slice(0, 35),
          AttentionName: receiverName.slice(0, 35),
          Phone: {
            Number: receiverPhone,
          },
          Address: {
            AddressLine: [
              receiverAddressLine1.slice(0, 35),
              receiverAddressLine2.slice(0, 35),
            ].filter(Boolean),
            City: receiverCity.slice(0, 30),
            StateProvinceCode: receiverState.slice(0, 5),
            PostalCode: receiverPostalCode,
            CountryCode: destinationCountry,
          },
        },
        PaymentInformation: {
          ShipmentCharge: {
            Type: "01",
            BillShipper: {
              AccountNumber: UPS_ACCOUNT_NUMBER,
            },
          },
        },
        Service: {
          Code: serviceCode,
          Description: serviceDescription,
        },
        Package: [packageData],
      },
      LabelSpecification: {
        LabelImageFormat: {
          Code: "PDF",
        },
        HTTPUserAgent: "Mozilla/4.5",
        LabelStockSize: {
          Height: "4",
          Width: "6",
        },
      },
    },
  };

  const upsResponse = await axios.post(UPS_SHIP_URL, upsRequest, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      transId: childAwbNo || awbNo,
      transactionSrc: "testing",
    },
    timeout: 30000,
  });

  return upsResponse.data.ShipmentResponse?.ShipmentResults;
}

// Create UPS Label Endpoint (POST)
export async function POST(request) {
  //   try {
  //     await connectDB();

  //     const body = await request.json();
  //     const { awbNo, consigneeData, action } = body;

  //     if (!awbNo) {
  //       return NextResponse.json(
  //         { success: false, message: "AWB Number is required" },
  //         { status: 400 }
  //       );
  //     }

  //     // Handle Save action
  //     if (action === "save") {
  //       const { labels } = body;

  //       if (!labels || !Array.isArray(labels)) {
  //         return NextResponse.json(
  //           { success: false, message: "Labels data is required for saving" },
  //           { status: 400 }
  //         );
  //       }

  //       const shipment = await Shipment.findOne({ awbNo: awbNo.toUpperCase() });

  //       if (!shipment) {
  //         return NextResponse.json(
  //           { success: false, message: "Shipment not found" },
  //           { status: 404 }
  //         );
  //       }

  //       // Update forwardingNo in Shipment for single piece
  //       if (shipment.pcs === 1 && labels.length > 0) {
  //         shipment.forwardingNo = labels[0].trackingNumber;
  //         await shipment.save();
  //       }

  //       // Update forwardingNo in ChildShipment for multi-piece
  //       if (shipment.pcs > 1) {
  //         for (const label of labels) {
  //           if (label.childNo && label.trackingNumber) {
  //             await ChildShipment.findOneAndUpdate(
  //               {
  //                 masterAwbNo: awbNo.toUpperCase(),
  //                 childAwbNo: label.childNo
  //               },
  //               {
  //                 forwardingNo: label.trackingNumber
  //               }
  //             );
  //           }
  //         }
  //       }

  //       return NextResponse.json({
  //         success: true,
  //         message: "Forwarding numbers saved successfully",
  //       });
  //     }
  try {
    await connectDB();

    const body = await request.json();
    const { awbNo, consigneeData, action } = body;

    if (!awbNo) {
      return NextResponse.json(
        { success: false, message: "AWB Number is required" },
        { status: 400 }
      );
    }

    // Handle Save action
    if (action === "save") {
      const { labels } = body;

      if (!labels || !Array.isArray(labels)) {
        return NextResponse.json(
          { success: false, message: "Labels data is required for saving" },
          { status: 400 }
        );
      }

      const shipment = await Shipment.findOne({ awbNo: awbNo.toUpperCase() });

      if (!shipment) {
        return NextResponse.json(
          { success: false, message: "Shipment not found" },
          { status: 404 }
        );
      }

      // FIXED: Update forwardingNo in Shipment for single piece
      if (shipment.pcs === 1 && labels.length > 0) {
        // Get the first label's tracking number
        const firstLabel = labels.find((label) => label.trackingNumber);
        if (firstLabel) {
          await Shipment.findOneAndUpdate(
            { awbNo: awbNo.toUpperCase() },
            {
              forwardingNo: firstLabel.trackingNumber,
              forwarder: "UPS", // Also update forwarder field to UPS
            }
          );
        }
      }

      // Update forwardingNo in ChildShipment for multi-piece
      if (shipment.pcs > 1) {
        // Also update the parent shipment's forwardingNo with the first label
        if (labels.length > 0 && labels[0].trackingNumber) {
          await Shipment.findOneAndUpdate(
            { awbNo: awbNo.toUpperCase() },
            {
              forwardingNo: labels[0].trackingNumber,
              forwarder: "UPS",
            }
          );
        }

        // Update each child shipment
        for (const label of labels) {
          if (label.childNo && label.trackingNumber) {
            await ChildShipment.findOneAndUpdate(
              {
                masterAwbNo: awbNo.toUpperCase(),
                childAwbNo: label.childNo,
              },
              {
                forwardingNo: label.trackingNumber,
                forwarder: "UPS",
              }
            );
          }
        }
      }

      return NextResponse.json({
        success: true,
        message: "Forwarding numbers saved successfully",
      });
    }

    // Handle Create Label action (default)
    const shipment = await Shipment.findOne({ awbNo: awbNo.toUpperCase() });

    if (!shipment) {
      return NextResponse.json(
        { success: false, message: "Shipment not found" },
        { status: 404 }
      );
    }

    if (shipment.isHold) {
      return NextResponse.json(
        {
          success: false,
          message: `Shipment is on hold. Reason: ${
            shipment.holdReason || "Not specified"
          }`,
        },
        { status: 400 }
      );
    }

    const childShipments = await ChildShipment.find({
      masterAwbNo: awbNo.toUpperCase(),
    });

    const childNumbers = [];
    if (
      shipment.shipmentAndPackageDetails &&
      Array.isArray(shipment.shipmentAndPackageDetails)
    ) {
      shipment.shipmentAndPackageDetails.forEach((detail) => {
        if (Array.isArray(detail)) {
          detail.forEach((item) => {
            if (item.childNo) {
              childNumbers.push(item.childNo);
            }
          });
        }
      });
    }

    const childAwbNumbers =
      childNumbers.length > 0
        ? childNumbers
        : childShipments.map((cs) => cs.childAwbNo);

    if (shipment.pcs > 1 && childAwbNumbers.length === 0) {
      return NextResponse.json(
        {
          success: false,
          message: "Please generate Child AWB Numbers before creating labels",
        },
        { status: 400 }
      );
    }

    const customer = await CustomerAccount.findOne({
      accountCode: shipment.accountCode,
    });

    if (!customer) {
      return NextResponse.json(
        { success: false, message: "Customer account not found" },
        { status: 404 }
      );
    }

    const accessToken = await getUPSToken();

    const cleanPhone = (phone) => {
      if (!phone) return "0000000000";
      const cleaned = phone.toString().replace(/\D/g, "");
      return cleaned || "0000000000";
    };

    const getCountryCode = (country) => {
      if (!country) return "US";
      const countryLower = country.toLowerCase().trim();
      const countryMap = {
        canada: "CA",
        ca: "CA",
        can: "CA",
        "united states": "US",
        usa: "US",
        us: "US",
        "united kingdom": "GB",
        uk: "GB",
        gb: "GB",
        australia: "AU",
        aus: "AU",
        au: "AU",
        india: "IN",
        ind: "IN",
        in: "IN",
      };
      if (countryMap[countryLower]) {
        return countryMap[countryLower];
      }
      return country.toUpperCase().slice(0, 2);
    };

    const formatCanadianPostalCode = (postalCode) => {
      if (!postalCode) return "M5B2H1";
      let cleaned = postalCode
        .toString()
        .replace(/[^A-Za-z0-9]/g, "")
        .toUpperCase();
      if (cleaned.length !== 6) {
        console.warn(
          `Postal code ${postalCode} is not 6 characters. Using default M5B2H1.`
        );
        return "M5B2H1";
      }
      const canadianFormat = /^[A-Z]\d[A-Z]\d[A-Z]\d$/;
      if (!canadianFormat.test(cleaned)) {
        console.warn(
          `Postal code ${postalCode} doesn't match Canadian format. Using default M5B2H1.`
        );
        return "M5B2H1";
      }
      return cleaned;
    };

    const formatPostalCode = (postalCode, country) => {
      if (!postalCode) return country === "US" ? "07102" : "000000";
      return postalCode.toString().replace(/\s/g, "").slice(0, 10);
    };

    const packageData = {
      Description: { Code: "01" },
      Packaging: { Code: "02", Description: "Package" },
      Dimensions: {
        UnitOfMeasurement: { Code: "CM" },
        Length: shipment.boxes?.[0]?.length || "30",
        Width: shipment.boxes?.[0]?.width || "20",
        Height: shipment.boxes?.[0]?.height || "15",
      },
      PackageWeight: {
        UnitOfMeasurement: { Code: "KGS" },
        Weight: shipment.totalActualWt.toFixed(1),
      },
      ReferenceNumber: [{ Code: "01", Value: awbNo }],
    };

    const destinationCountry = getCountryCode(shipment.receiverCountry || "US");
    const shipperCountry = "CA";
    const shipperName = customer.name || "DRISHTI CANADA INC";
    const shipperContactPerson = customer.contactPerson || shipperName;
    const shipperPhone = cleanPhone(customer.telNo || "+14165551234");
    const shipperAddressLine1 = "123 Yonge Street";
    const shipperAddressLine2 = "Suite 200";
    const shipperCity = "Toronto";
    const shipperProvince = "ON";
    const shipperPostalCode = formatCanadianPostalCode(
      customer.pinCode || "M5B2H1"
    );

    const isDomesticCanada = destinationCountry === "CA";
    const serviceCode = isDomesticCanada ? "01" : "11";
    const serviceDescription = isDomesticCanada
      ? "UPS Express"
      : "UPS Standard";

    const baseShipmentData = {
      shipperName,
      shipperContactPerson,
      shipperPhone,
      shipperAddressLine1,
      shipperAddressLine2,
      shipperCity,
      shipperProvince,
      shipperPostalCode,
      shipperCountry,
      destinationCountry,
      serviceCode,
      serviceDescription,
      description: (shipment.content?.[0] || "Documents").slice(0, 35),
    };

    const allLabels = [];

    if (childShipments.length > 0) {
      console.log(
        `Creating ${childShipments.length} labels for child shipments`
      );

      for (const childShipment of childShipments) {
        try {
          const childShipmentData = {
            ...baseShipmentData,
            receiverName:
              childShipment.consigneeName ||
              shipment.receiverFullName ||
              "John Smith",
            receiverPhone: cleanPhone(
              shipment.receiverPhoneNumber || "2015551234"
            ),
            receiverAddressLine1:
              childShipment.consigneeAdd ||
              shipment.receiverAddressLine1 ||
              "123 Main Street",
            receiverAddressLine2: shipment.receiverAddressLine2 || "Apt 4B",
            receiverCity:
              childShipment.consigneeCity || shipment.receiverCity || "Newark",
            receiverState:
              childShipment.consigneeState || shipment.receiverState || "NJ",
            receiverPostalCode: formatPostalCode(
              childShipment.consigneeZip || shipment.receiverPincode || "07102",
              destinationCountry
            ),
          };

          const childPackageData = {
            ...packageData,
            ReferenceNumber: [{ Code: "01", Value: childShipment.childAwbNo }],
          };

          const shipmentResults = await createSingleUPSLabel(
            accessToken,
            childShipmentData,
            childPackageData,
            awbNo,
            childShipment.childAwbNo
          );

          if (shipmentResults) {
            const packageResults = Array.isArray(shipmentResults.PackageResults)
              ? shipmentResults.PackageResults
              : [shipmentResults.PackageResults];

            packageResults.forEach((pkg) => {
              allLabels.push({
                trackingNumber: pkg.TrackingNumber,
                labelUrl: `data:application/pdf;base64,${pkg.ShippingLabel.GraphicImage}`,
                childNo: childShipment.childAwbNo,
                packageNumber: allLabels.length + 1,
              });
            });
          }

          console.log(
            `Label created for child AWB: ${childShipment.childAwbNo}`
          );
        } catch (error) {
          console.error(
            `Failed to create label for child AWB ${childShipment.childAwbNo}:`,
            error.message
          );
        }
      }
    } else if (childAwbNumbers.length > 0) {
      console.log(
        `Creating ${childAwbNumbers.length} labels from shipmentAndPackageDetails`
      );

      for (const childNo of childAwbNumbers) {
        try {
          const shipmentData = {
            ...baseShipmentData,
            receiverName: shipment.receiverFullName || "John Smith",
            receiverPhone: cleanPhone(
              shipment.receiverPhoneNumber || "2015551234"
            ),
            receiverAddressLine1:
              shipment.receiverAddressLine1 || "123 Main Street",
            receiverAddressLine2: shipment.receiverAddressLine2 || "Apt 4B",
            receiverCity: shipment.receiverCity || "Newark",
            receiverState: shipment.receiverState || "NJ",
            receiverPostalCode: formatPostalCode(
              shipment.receiverPincode || "07102",
              destinationCountry
            ),
          };

          const childPackageData = {
            ...packageData,
            ReferenceNumber: [{ Code: "01", Value: childNo }],
          };

          const shipmentResults = await createSingleUPSLabel(
            accessToken,
            shipmentData,
            childPackageData,
            awbNo,
            childNo
          );

          if (shipmentResults) {
            const packageResults = Array.isArray(shipmentResults.PackageResults)
              ? shipmentResults.PackageResults
              : [shipmentResults.PackageResults];

            packageResults.forEach((pkg) => {
              allLabels.push({
                trackingNumber: pkg.TrackingNumber,
                labelUrl: `data:application/pdf;base64,${pkg.ShippingLabel.GraphicImage}`,
                childNo: childNo,
                packageNumber: allLabels.length + 1,
              });
            });
          }

          console.log(`Label created for child number: ${childNo}`);
        } catch (error) {
          console.error(
            `Failed to create label for child number ${childNo}:`,
            error.message
          );
        }
      }
    } else {
      console.log("Creating single label for master shipment");

      const shipmentData = {
        ...baseShipmentData,
        receiverName: shipment.receiverFullName || "John Smith",
        receiverPhone: cleanPhone(shipment.receiverPhoneNumber || "2015551234"),
        receiverAddressLine1:
          shipment.receiverAddressLine1 || "123 Main Street",
        receiverAddressLine2: shipment.receiverAddressLine2 || "Apt 4B",
        receiverCity: shipment.receiverCity || "Newark",
        receiverState: shipment.receiverState || "NJ",
        receiverPostalCode: formatPostalCode(
          shipment.receiverPincode || "07102",
          destinationCountry
        ),
      };

      const shipmentResults = await createSingleUPSLabel(
        accessToken,
        shipmentData,
        packageData,
        awbNo
      );

      if (shipmentResults) {
        const packageResults = Array.isArray(shipmentResults.PackageResults)
          ? shipmentResults.PackageResults
          : [shipmentResults.PackageResults];

        packageResults.forEach((pkg) => {
          allLabels.push({
            trackingNumber: pkg.TrackingNumber,
            labelUrl: `data:application/pdf;base64,${pkg.ShippingLabel.GraphicImage}`,
            childNo: null,
            packageNumber: 1,
          });
        });
      }
    }

    console.log(`Total labels created: ${allLabels.length}`);

    return NextResponse.json({
      success: true,
      message: `UPS labels created successfully (${allLabels.length} label${
        allLabels.length !== 1 ? "s" : ""
      })`,
      labels: allLabels,
      totalLabels: allLabels.length,
    });
  } catch (error) {
    console.error("=== UPS API ERROR ===");
    console.error("Error:", error.message);
    console.error("Response:", JSON.stringify(error.response?.data, null, 2));
    console.error("====================");

    let errorMessage = "Failed to create UPS label";
    if (error.response?.data?.response?.errors) {
      const errors = error.response.data.response.errors;
      errorMessage = errors
        .map((err) => `${err.code}: ${err.message}`)
        .join(", ");
    } else if (error.response?.data?.fault?.detail?.errors) {
      const errors = error.response.data.fault.detail.errors;
      errorMessage = errors
        .map((err) => `${err.code}: ${err.message}`)
        .join(", ");
    } else if (error.response?.data?.error_description) {
      errorMessage = error.response.data.error_description;
    } else if (error.message) {
      errorMessage = error.message;
    }

    return NextResponse.json(
      {
        success: false,
        message: errorMessage,
        details: error.response?.data,
      },
      { status: error.response?.status || 500 }
    );
  }
}
export async function PUT(request) {
  try {
    await connectDB();

    const body = await request.json();
    const { awbNo, consigneeData } = body;

    if (!awbNo) {
      return NextResponse.json(
        { success: false, message: "AWB Number is required" },
        { status: 400 }
      );
    }

    if (!consigneeData) {
      return NextResponse.json(
        { success: false, message: "Consignee data is required" },
        { status: 400 }
      );
    }

    const shipment = await Shipment.findOne({ awbNo: awbNo.toUpperCase() });

    if (!shipment) {
      return NextResponse.json(
        { success: false, message: "Shipment not found" },
        { status: 404 }
      );
    }

    // Update consignee fields
    if (consigneeData.consignee !== undefined) {
      shipment.receiverFullName = consigneeData.consignee;
    }
    if (consigneeData.addressLine1 !== undefined) {
      shipment.receiverAddressLine1 = consigneeData.addressLine1;
    }
    if (consigneeData.addressLine2 !== undefined) {
      shipment.receiverAddressLine2 = consigneeData.addressLine2;
    }
    if (consigneeData.zipcode !== undefined) {
      shipment.receiverPincode = consigneeData.zipcode;
    }
    if (consigneeData.city !== undefined) {
      shipment.receiverCity = consigneeData.city;
    }
    if (consigneeData.state !== undefined) {
      shipment.receiverState = consigneeData.state;
    }
    if (consigneeData.telephone !== undefined) {
      shipment.receiverPhoneNumber = consigneeData.telephone;
    }

    await shipment.save();

    return NextResponse.json({
      success: true,
      message: "Consignee details updated successfully",
      data: {
        receiverFullName: shipment.receiverFullName,
        receiverAddressLine1: shipment.receiverAddressLine1,
        receiverAddressLine2: shipment.receiverAddressLine2,
        receiverPincode: shipment.receiverPincode,
        receiverCity: shipment.receiverCity,
        receiverState: shipment.receiverState,
        receiverPhoneNumber: shipment.receiverPhoneNumber,
      },
    });
  } catch (error) {
    console.error("Update Consignee Error:", error);
    return NextResponse.json(
      { success: false, message: "Failed to update consignee details" },
      { status: 500 }
    );
  }
}

// Delete Labels Endpoint (DELETE)
export async function DELETE(request) {
  try {
    await connectDB();

    const { searchParams } = new URL(request.url);
    const awbNo = searchParams.get("awbNo");

    if (!awbNo) {
      return NextResponse.json(
        { success: false, message: "AWB Number is required" },
        { status: 400 }
      );
    }

    const shipment = await Shipment.findOne({ awbNo: awbNo.toUpperCase() });

    if (!shipment) {
      return NextResponse.json(
        { success: false, message: "Shipment not found" },
        { status: 404 }
      );
    }

    // Clear forwardingNo from Shipment
    shipment.forwardingNo = "";
    await shipment.save();

    // Clear forwardingNo from all ChildShipments
    await ChildShipment.updateMany(
      { masterAwbNo: awbNo.toUpperCase() },
      { forwardingNo: "" }
    );

    return NextResponse.json({
      success: true,
      message: "Labels deleted successfully",
    });
  } catch (error) {
    console.error("Delete Labels Error:", error);
    return NextResponse.json(
      { success: false, message: "Failed to delete labels" },
      { status: 500 }
    );
  }
}
