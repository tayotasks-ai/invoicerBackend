const getPagination = (page = 1, perPage = 10) => {
    // Convert to numbers and set defaults
    page = Math.max(1, Number(page)); // Ensure page is at least 1
    perPage = Math.max(1, Number(perPage)); // Ensure perPage is at least 1
  
    // Calculate skip (offset)
    const skip = (page - 1) * perPage;
  
    return {
      page,
      perPage,
      skip,
      limit: perPage
    };
};
  
  module.exports = getPagination;